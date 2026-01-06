//! Account API endpoints

use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, get, post, put},
    Json, Router,
};
use serde::{Deserialize, Serialize};

use super::state::AppState;
use crate::db::{self, Account};

/// Account response (without sensitive tokens)
#[derive(Debug, Serialize)]
pub struct AccountResponse {
    pub id: i64,
    pub email: String,
    pub display_name: Option<String>,
    pub photo_url: Option<String>,
    pub is_active: bool,
    pub sort_order: i32,
    pub expires_at: i64,
}

impl From<Account> for AccountResponse {
    fn from(a: Account) -> Self {
        Self {
            id: a.id,
            email: a.email,
            display_name: a.display_name,
            photo_url: a.photo_url,
            is_active: a.is_active,
            sort_order: a.sort_order,
            expires_at: a.expires_at,
        }
    }
}

/// Toggle account request
#[derive(Debug, Deserialize)]
pub struct ToggleAccountRequest {
    pub is_active: bool,
}

/// Build account routes
pub fn account_routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list_accounts))
        .route("/current", get(get_current))
        .route("/{id}", get(get_account))
        .route("/{id}", delete(delete_account))
        .route("/{id}/toggle", put(toggle_account))
        .route("/{id}/current", post(set_current))
}

/// List all accounts
async fn list_accounts(
    State(state): State<AppState>,
) -> Result<Json<Vec<AccountResponse>>, StatusCode> {
    let accounts = state
        .db
        .with_conn(|conn| db::get_all_accounts(conn))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(accounts.into_iter().map(Into::into).collect()))
}

/// Get account by ID
async fn get_account(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<AccountResponse>, StatusCode> {
    let account = state
        .db
        .with_conn(|conn| db::get_account_by_id(conn, id))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(account.into()))
}

/// Get current account
async fn get_current(
    State(state): State<AppState>,
) -> Result<Json<Option<AccountResponse>>, StatusCode> {
    let account = state
        .db
        .with_conn(|conn| db::get_current_account(conn))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(account.map(Into::into)))
}

/// Delete account
async fn delete_account(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<StatusCode, StatusCode> {
    let deleted = state
        .db
        .with_conn(|conn| db::delete_account(conn, id))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

/// Toggle account active status
async fn toggle_account(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let is_active = state
        .db
        .with_conn(|conn| db::toggle_account_active(conn, id))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(serde_json::json!({ "is_active": is_active })))
}

/// Set current account
async fn set_current(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<StatusCode, StatusCode> {
    // Verify account exists
    let _ = state
        .db
        .with_conn(|conn| db::get_account_by_id(conn, id))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    state
        .db
        .with_conn(|conn| db::set_current_account(conn, Some(id)))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::OK)
}
