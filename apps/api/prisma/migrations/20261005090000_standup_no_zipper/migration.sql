-- "Standup with zipper" was "Standup WITHOUT zipper".
--
-- The style was added last week from a list the client wrote as "standup with
-- zipper". Their next revision reads "Standup Without Zipper", which is the
-- opposite thing — and the value was sitting in ZIPPERED_POUCHES, so every one
-- of them was being charged for a zipper it does not have.
--
-- Renamed rather than added-and-retired because nothing has used it: the value
-- is four days old and no quotation line carries it.
ALTER TYPE "PouchType" RENAME VALUE 'STANDUP_WITH_ZIPPER' TO 'STANDUP_NO_ZIPPER';
