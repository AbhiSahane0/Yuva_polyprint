import { describe, expect, it } from 'vitest';
import {
  canMoveDispatchTo,
  countsAsDelivered,
  deliveryBasis,
  lineNetKg,
  lineValue,
  orderDelivery,
  packageCount,
  packagesNetKg,
} from './dispatch.js';

const order = {
  quantityKg: 500,
  quantityPouches: 0,
  ratePerPouch: 0,
  producedKg: 512,
  producedPouches: 0,
  dispatchedKg: 0,
  dispatchedPouches: 0,
};

describe('where a note may go', () => {
  it('lets a draft go out or be thrown away', () => {
    expect(canMoveDispatchTo('DRAFT', 'DISPATCHED')).toBe(true);
    expect(canMoveDispatchTo('DRAFT', 'CANCELLED')).toBe(true);
  });

  it('lets a lorry turned back at the gate be cancelled', () => {
    expect(canMoveDispatchTo('DISPATCHED', 'CANCELLED')).toBe(true);
  });

  it('never un-cancels, and never sends a cancelled note again', () => {
    expect(canMoveDispatchTo('CANCELLED', 'DRAFT')).toBe(false);
    expect(canMoveDispatchTo('CANCELLED', 'DISPATCHED')).toBe(false);
  });

  it('does not let a note that has gone out go back to a draft', () => {
    expect(canMoveDispatchTo('DISPATCHED', 'DRAFT')).toBe(false);
  });

  it('counts only a dispatched note as delivered', () => {
    expect(countsAsDelivered('DISPATCHED')).toBe(true);
    expect(countsAsDelivered('DRAFT')).toBe(false);
    expect(countsAsDelivered('CANCELLED')).toBe(false);
  });
});

describe('what the lorry carries', () => {
  it('adds the reels up', () => {
    expect(packagesNetKg([{ netKg: 104.5 }, { netKg: 98.25 }, { netKg: 101 }])).toBe(303.75);
  });

  it('takes the reels over a typed total, so a challan reads one way', () => {
    expect(lineNetKg({ quantityKg: 300, packages: [{ netKg: 104.5 }, { netKg: 98.25 }] })).toBe(
      202.75,
    );
  });

  it('stands by the typed total when the office has no reel weights', () => {
    expect(lineNetKg({ quantityKg: 300 })).toBe(300);
    expect(lineNetKg({ quantityKg: 300, packages: [] })).toBe(300);
  });

  it('never reads a negative weight off a line', () => {
    expect(lineNetKg({ quantityKg: -40 })).toBe(0);
  });

  it('counts the packages the driver signs for', () => {
    expect(packageCount({ packages: [{ netKg: 1 }, { netKg: 2 }] })).toBe(2);
    expect(packageCount({})).toBe(0);
  });
});

describe('how an order is judged delivered', () => {
  it('goes by weight for a reel job', () => {
    expect(deliveryBasis({ quantityPouches: 0, ratePerPouch: 0 })).toBe('PER_KG');
  });

  it('goes by count for a pouch job', () => {
    expect(deliveryBasis({ quantityPouches: 100_000, ratePerPouch: 1.4 })).toBe('PER_POUCH');
  });

  it('will not take a pouch count with no per-pouch rate as a basis', () => {
    // A count is not a price. Mirrors orderAmount, deliberately.
    expect(deliveryBasis({ quantityPouches: 100_000, ratePerPouch: 0 })).toBe('PER_KG');
  });
});

describe('where an order’s delivery has got to', () => {
  it('has everything in the godown before anything goes', () => {
    const state = orderDelivery(order);
    expect(state.readyKg).toBe(512);
    expect(state.pendingKg).toBe(500);
    expect(state.percentDispatched).toBe(0);
    expect(state.isFullyDispatched).toBe(false);
  });

  it('splits a part delivery between what has gone and what is left', () => {
    const state = orderDelivery({ ...order, dispatchedKg: 300 });
    expect(state.readyKg).toBe(212);
    expect(state.pendingKg).toBe(200);
    expect(state.percentDispatched).toBe(60);
    expect(state.isFullyDispatched).toBe(false);
  });

  it('completes the order the moment the last of it goes', () => {
    const state = orderDelivery({ ...order, dispatchedKg: 500 });
    expect(state.pendingKg).toBe(0);
    expect(state.isFullyDispatched).toBe(true);
    /* The overrun stays in the godown. It was made, it was not ordered, and it
       is not pending — somebody has to decide what happens to it. */
    expect(state.readyKg).toBe(12);
  });

  it('is complete when the overrun goes out too, and never over 100%', () => {
    const state = orderDelivery({ ...order, dispatchedKg: 512 });
    expect(state.isFullyDispatched).toBe(true);
    expect(state.percentDispatched).toBe(100);
    expect(state.readyKg).toBe(0);
  });

  it('reports sending more than was made, rather than a negative godown', () => {
    const state = orderDelivery({ ...order, dispatchedKg: 530 });
    expect(state.overProducedKg).toBe(18);
    expect(state.readyKg).toBe(0);
  });

  it('does not call a short run an over-dispatch', () => {
    const state = orderDelivery({ ...order, producedKg: 480, dispatchedKg: 480 });
    expect(state.overProducedKg).toBe(0);
    expect(state.readyKg).toBe(0);
    /* 480 of 500 sent, and nothing left to send it from. The order is NOT
       complete — somebody has to decide to close it short, and that is the
       office's call, not arithmetic's. */
    expect(state.isFullyDispatched).toBe(false);
    expect(state.pendingKg).toBe(20);
  });

  it('judges a pouch order on its count, not its weight', () => {
    const state = orderDelivery({
      quantityKg: 420,
      quantityPouches: 100_000,
      ratePerPouch: 1.4,
      producedKg: 430,
      producedPouches: 101_000,
      dispatchedKg: 430,
      dispatchedPouches: 99_000,
    });
    /* Every kilogram has gone and the order is still not delivered: a thousand
       bags short is a thousand bags short. */
    expect(state.basis).toBe('PER_POUCH');
    expect(state.isFullyDispatched).toBe(false);
    expect(state.pendingPouches).toBe(1000);
    expect(state.percentDispatched).toBe(99);
  });

  it('does not put a nonsense percentage on an order with no quantity', () => {
    const state = orderDelivery({ ...order, quantityKg: 0 });
    expect(state.percentDispatched).toBe(100);
    expect(state.isFullyDispatched).toBe(false);
  });
});

describe('what a line is worth', () => {
  it('prices a reel line on weight', () => {
    expect(lineValue({ netKg: 202.75, pouches: 0, ratePerKg: 186.5, ratePerPouch: 0 })).toBe(
      37812.88,
    );
  });

  it('prices a pouch line on the count', () => {
    expect(lineValue({ netKg: 202.75, pouches: 50_000, ratePerKg: 186.5, ratePerPouch: 1.4 })).toBe(
      70000,
    );
  });

  it('falls back to weight when there is no per-pouch rate', () => {
    expect(lineValue({ netKg: 100, pouches: 50_000, ratePerKg: 200, ratePerPouch: 0 })).toBe(20000);
  });
});
