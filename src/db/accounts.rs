//! Account database operations

use super::models::Account;
use rusqlite::{params, Connection, OptionalExtension, Result};
use std::time::{SystemTime, UNIX_EPOCH};

/// Get current timestamp in seconds
fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

/// Get all accounts ordered by sort_order
pub fn get_all_accounts(conn: &Connection) -> Result<Vec<Account>> {
    let mut stmt = conn.prepare(
        "SELECT id, email, display_name, photo_url, access_token, refresh_token,
                expires_at, is_active, sort_order, created_at, updated_at
         FROM accounts ORDER BY sort_order ASC",
    )?;

    let accounts = stmt
        .query_map([], |row| {
            Ok(Account {
                id: row.get(0)?,
                email: row.get(1)?,
                display_name: row.get(2)?,
                photo_url: row.get(3)?,
                access_token: row.get(4)?,
                refresh_token: row.get(5)?,
                expires_at: row.get(6)?,
                is_active: row.get::<_, i32>(7)? != 0,
                sort_order: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;

    Ok(accounts)
}

/// Get account by ID
pub fn get_account_by_id(conn: &Connection, id: i64) -> Result<Option<Account>> {
    let mut stmt = conn.prepare(
        "SELECT id, email, display_name, photo_url, access_token, refresh_token,
                expires_at, is_active, sort_order, created_at, updated_at
         FROM accounts WHERE id = ?",
    )?;

    let account = stmt
        .query_row([id], |row| {
            Ok(Account {
                id: row.get(0)?,
                email: row.get(1)?,
                display_name: row.get(2)?,
                photo_url: row.get(3)?,
                access_token: row.get(4)?,
                refresh_token: row.get(5)?,
                expires_at: row.get(6)?,
                is_active: row.get::<_, i32>(7)? != 0,
                sort_order: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })
        .optional()?;

    Ok(account)
}

/// Get the current selected account
pub fn get_current_account(conn: &Connection) -> Result<Option<Account>> {
    let account_id: Option<i64> = conn
        .query_row(
            "SELECT account_id FROM current_account WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .optional()?
        .flatten();

    if let Some(id) = account_id {
        get_account_by_id(conn, id)
    } else {
        Ok(None)
    }
}

/// Save or update an account
pub fn save_account(conn: &Connection, account: &Account) -> Result<i64> {
    let now = now();

    if account.id == 0 {
        // Insert new account
        let max_order: i32 = conn
            .query_row("SELECT COALESCE(MAX(sort_order), -1) FROM accounts", [], |row| {
                row.get(0)
            })
            .unwrap_or(-1);

        conn.execute(
            "INSERT INTO accounts (email, display_name, photo_url, access_token, refresh_token,
                                   expires_at, is_active, sort_order, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                account.email,
                account.display_name,
                account.photo_url,
                account.access_token,
                account.refresh_token,
                account.expires_at,
                account.is_active as i32,
                max_order + 1,
                now,
                now
            ],
        )?;

        Ok(conn.last_insert_rowid())
    } else {
        // Update existing account
        conn.execute(
            "UPDATE accounts SET email = ?, display_name = ?, photo_url = ?,
                                 access_token = ?, refresh_token = ?, expires_at = ?,
                                 is_active = ?, sort_order = ?, updated_at = ?
             WHERE id = ?",
            params![
                account.email,
                account.display_name,
                account.photo_url,
                account.access_token,
                account.refresh_token,
                account.expires_at,
                account.is_active as i32,
                account.sort_order,
                now,
                account.id
            ],
        )?;

        Ok(account.id)
    }
}

/// Delete an account by ID
pub fn delete_account(conn: &Connection, id: i64) -> Result<bool> {
    let rows = conn.execute("DELETE FROM accounts WHERE id = ?", [id])?;
    Ok(rows > 0)
}

/// Set the current account
pub fn set_current_account(conn: &Connection, account_id: Option<i64>) -> Result<()> {
    conn.execute(
        "UPDATE current_account SET account_id = ? WHERE id = 1",
        [account_id],
    )?;
    Ok(())
}

/// Toggle account active status
pub fn toggle_account_active(conn: &Connection, id: i64) -> Result<bool> {
    conn.execute(
        "UPDATE accounts SET is_active = NOT is_active, updated_at = ? WHERE id = ?",
        params![now(), id],
    )?;

    let is_active: i32 = conn.query_row(
        "SELECT is_active FROM accounts WHERE id = ?",
        [id],
        |row| row.get(0),
    )?;

    Ok(is_active != 0)
}

/// Get only active accounts
pub fn get_active_accounts(conn: &Connection) -> Result<Vec<Account>> {
    let mut stmt = conn.prepare(
        "SELECT id, email, display_name, photo_url, access_token, refresh_token,
                expires_at, is_active, sort_order, created_at, updated_at
         FROM accounts WHERE is_active = 1 ORDER BY sort_order ASC",
    )?;

    let accounts = stmt
        .query_map([], |row| {
            Ok(Account {
                id: row.get(0)?,
                email: row.get(1)?,
                display_name: row.get(2)?,
                photo_url: row.get(3)?,
                access_token: row.get(4)?,
                refresh_token: row.get(5)?,
                expires_at: row.get(6)?,
                is_active: row.get::<_, i32>(7)? != 0,
                sort_order: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;

    Ok(accounts)
}
