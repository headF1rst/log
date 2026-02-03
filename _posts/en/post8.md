---
title: "PostgreSQL MVCC Internals: From xmin/xmax to Isolation Levels"
date: "2025-07-06"
section: tech
tags: "PostgreSQL"
thumbnail: "https://media2.dev.to/dynamic/image/width=1000,height=420,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Farticles%2F7rk467sodudw3ww7iisi.png"
description: "Deep dive into PostgreSQL's MVCC implementation, understanding xmin/xmax and how different isolation levels work internally"
searchKeywords: "PostgreSQL, MVCC, xmin, xmax, transaction, isolation level, concurrency control"
---

When multiple users access a database concurrently, how can we guarantee Isolation, one of the core `ACID` properties? While we could apply locks when reading or writing data, this approach is inefficient because other users must wait for lock to be released.

To address this challenge, modern RDBMSs like PostgreSQL and MySQL (InnoDB) employ a technique called **MVCC (Multi-Version Concurrency Control)**.

The core idea of MVCC is to create a new version of a row each time it's modified, instead of overwriting existing data. This method controls concurrency by storing version information for each row, tracking which transaction created or deleted it.

While various database vendors share this core concept of MVCC, their implementations differ. Let's explore these differences by examining the MVCC methods of two of the most popular databases: PostgreSQL and MySQL.

## How PostgreSQL Implements MVCC

In PostgreSQL, each row in a table (internally called a 'tuple') contains several system columns that are not directly visible to the user. The key columns for transaction control are xmin and xmax.

- `xmin`: The transaction ID that created this row version.
- `xmax`: The transaction ID that deleted this row version.

Using these two columns, PostgreSQL operates as follows:

- **INSERT**: A new row is created, and the current transaction's ID is recorded in the xmin column. The xmax column remains null.

- **DELETE**: Instead of being physically removed immediately, the row's xmax column is updated with the current transaction's ID. This row is now considered a 'dead tuple'.

- **UPDATE**: This operates as a combination of a DELETE and an INSERT. First, the xmax of the current row is marked with the transaction ID. Then, a new row with updated values is inserted, and its xmin is set to the current transaction ID.

For a specific row to be visible to a transaction, it must satisfy both of the following visibility rules:

- **Creation Rule (xmin)**: The transaction that created the row version (xmin) must have been committed before the current transaction's snapshot was taken.

- **Deletion Rule (xmax)**: If the row version was deleted, the deleting transaction (xmax) must not have been committed before the current transaction's snapshot was taken.

## How MySQL (InnoDB) Implements MVCC

InnoDB, MySQL's default storage engine, also employs MVCC, but it manages old versions in a distinct way.

- **Core Metadata**: Each row contains important hidden columns, including `DB_TRX_ID` (the transaction ID that created the version, similar to xmin) and `DB_ROLL_PTR` (**the rollback pointer**).

- **Previous Version Storage**: Unlike PostgreSQL, which keeps old versions within the table itself, InnoDB stores before-images of data in a separate area called the **Undo Log**. The `DB_ROLL_PTR` is an address that points to the previous version of the data in this Undo Log.

- **Operation**: When a transaction encounters a data version that is newer than its snapshot, it follows the `DB_ROLL_PTR` to traverse the Undo Log, **reconstructing** a version of the data that is visible to it.

## Visibility in PostgreSQL by Isolation Level

Ultimately, visibility in PostgreSQL is determined by `xmin`, `xmax`, and a **snapshot**. The differences between isolation levels arise from when this snapshot is created.

Let's explain the visibility rules from the perspective of a transaction, `Tx A`, using a `users` table that contains two rows.

![mvcc1](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/38e7s46prs1j3dwdavyd.png)

### READ COMMITTED (Default)

In `READ COMMITTED` level, a **new snapshot is created for every SQL statement**. This means changes committed by other transactions become visible immediately. (`Non-Repeatable Read`)

#### 1. `Tx A` starts (TXID: 100) and executes its first `SELECT`.

A new snapshot, Snapshot_1, is created for this statement, capturing the current state of the database.

> Snapshot_1 Contents: {'Committed TXs': {90, 91}, 'In-Progress TXs': {100}}

Visibility Check (based on `Snapshot_1`):

- 'Alice' row (`xmin=90`): xmin is in the committed list. -> **Visible**.

- 'Bob' row (`xmin=91`): xmin is in the committed list. -> **Visible**.

Result for Tx A: It sees two records: 'Alice' and 'Bob'.

#### 2. Tx B modifies data and commits.

The original 'Alice' row is updated with `xmax=101`, and a new 'Alicia' row is created with `xmin=101`.

The database's global list of committed transactions is updated to `{90, 91, 101}`.

![mvcc2](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/dv4t554i4ghzazoz7wdp.png)

#### 3. Tx A executes its second SELECT within the same transaction.

According to the `READ COMMITTED` rule, a **completely new** Snapshot_2 is created for this `SELECT` statement.

> Snapshot_2 Contents: {'Committed TXs': {90, 91, 101}, 'In-Progress TXs': {100}}

Visibility Check (based on `Snapshot_2`):

- Original 'Alice' row (`xmax=101`): `xmax` is in the committed list. -> **Not visible**.

- New 'Alicia' row (`xmin=101`): `xmin` is in the committed list. -> **Visible**.

- 'Bob' row (`xmin=91`): `xmin` is in the committed list. -> **Visible**.

Final Result for `Tx A`: It now sees two records: 'Alicia' and 'Bob'.

![mvcc3](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/slm5bd3c50nl5b05o9rg.png)

`Tx A` executed the same query twice within the same transaction but received different results. This phenomenon, known as a **Non-Repeatable Read**, is the expected behavior for the `READ COMMITTED` isolation level.

### REPEATABLE READ / SERIALIZABLE

In `REPEATABLE READ`, a **snapshot is created only once**, when the first SQL statement in the transaction is executed. This same snapshot is then reused until the transaction ends.

Because of this, even if `Tx B` changes data and commits, `Tx A` continues to judge visibility based on its old, fixed snapshot and therefore does not see the changes. This provides a consistent view of the data throughout the transaction, preventing Non-Repeatable Reads. The `SERIALIZABLE` level uses the same snapshot policy but adds more sophisticated dependency tracking to prevent all concurrency anomalies.

## Why Different Methods? (Design Philosophy Trade-offs)

The different MVCC implementations in PostgreSQL and MySQL reflect trade-offs in their design philosophies.

- **PostgreSQL**: This approach is optimized for **read performance**. Because previous versions are stored in the table itself, there is no overhead from reconstructing rows, which makes reads very fast. However, since 'dead tuples' accumulate within the table, a periodic cleanup process called `VACUUM` is essential. Without it, the table can suffer from 'bloat', becoming unnecessarily large.

- **MySQL (InnoDB)**: This approach prioritizes **table space efficiency**. Change history is managed in a separate Undo Log, so the table itself remains clean and contains only the latest data. However, reading past data may incur the additional cost of traversing the Undo Log to reconstruct a row version, and the Undo Log space itself requires management.

Both approaches have their pros and cons. Neither is absolutely superior; rather, they represent different choices made to achieve the distinct goals of each system.
