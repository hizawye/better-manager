//! Google OAuth authentication

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde::{Deserialize, Serialize};
use url::Url;

/// Google OAuth configuration
/// Note: These are public OAuth credentials for native applications
/// Users will see the consent screen with app details
pub struct GoogleOAuth {
    pub client_id: String,
    pub client_secret: String,
    pub redirect_uri: String,
}

impl Default for GoogleOAuth {
    fn default() -> Self {
        Self {
            // Placeholder - users need to provide their own credentials
            client_id: String::new(),
            client_secret: String::new(),
            redirect_uri: "http://localhost:8095/oauth/callback".to_string(),
        }
    }
}

/// Required OAuth scopes for Gemini API access
pub const SCOPES: &[&str] = &[
    "https://www.googleapis.com/auth/generative-language.retriever",
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
];

/// Token response from Google
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub token_type: String,
    pub expires_in: u64,
    pub refresh_token: Option<String>,
    pub scope: Option<String>,
}

/// User info from Google
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserInfo {
    pub email: String,
    pub name: Option<String>,
    pub picture: Option<String>,
}

impl GoogleOAuth {
    pub fn new(client_id: String, client_secret: String) -> Self {
        Self {
            client_id,
            client_secret,
            ..Default::default()
        }
    }

    /// Generate a random state parameter for CSRF protection
    pub fn generate_state() -> String {
        let mut bytes = [0u8; 16];
        getrandom::fill(&mut bytes).ok();
        URL_SAFE_NO_PAD.encode(bytes)
    }

    /// Generate the authorization URL
    pub fn generate_auth_url(&self, state: &str) -> String {
        let mut url = Url::parse("https://accounts.google.com/o/oauth2/v2/auth").unwrap();

        url.query_pairs_mut()
            .append_pair("client_id", &self.client_id)
            .append_pair("redirect_uri", &self.redirect_uri)
            .append_pair("response_type", "code")
            .append_pair("scope", &SCOPES.join(" "))
            .append_pair("access_type", "offline")
            .append_pair("prompt", "consent")
            .append_pair("state", state);

        url.to_string()
    }

    /// Exchange authorization code for tokens
    pub async fn exchange_code(&self, code: &str) -> Result<TokenResponse, AuthError> {
        let client = reqwest::Client::new();

        let response = client
            .post("https://oauth2.googleapis.com/token")
            .form(&[
                ("client_id", self.client_id.as_str()),
                ("client_secret", self.client_secret.as_str()),
                ("code", code),
                ("redirect_uri", self.redirect_uri.as_str()),
                ("grant_type", "authorization_code"),
            ])
            .send()
            .await
            .map_err(|e| AuthError::RequestFailed(e.to_string()))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(AuthError::TokenExchangeFailed(error_text));
        }

        response
            .json()
            .await
            .map_err(|e| AuthError::ParseFailed(e.to_string()))
    }

    /// Refresh an access token
    pub async fn refresh_token(&self, refresh_token: &str) -> Result<TokenResponse, AuthError> {
        let client = reqwest::Client::new();

        let response = client
            .post("https://oauth2.googleapis.com/token")
            .form(&[
                ("client_id", self.client_id.as_str()),
                ("client_secret", self.client_secret.as_str()),
                ("refresh_token", refresh_token),
                ("grant_type", "refresh_token"),
            ])
            .send()
            .await
            .map_err(|e| AuthError::RequestFailed(e.to_string()))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(AuthError::TokenRefreshFailed(error_text));
        }

        response
            .json()
            .await
            .map_err(|e| AuthError::ParseFailed(e.to_string()))
    }

    /// Get user info using an access token
    pub async fn get_user_info(&self, access_token: &str) -> Result<UserInfo, AuthError> {
        let client = reqwest::Client::new();

        let response = client
            .get("https://www.googleapis.com/oauth2/v2/userinfo")
            .bearer_auth(access_token)
            .send()
            .await
            .map_err(|e| AuthError::RequestFailed(e.to_string()))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(AuthError::UserInfoFailed(error_text));
        }

        response
            .json()
            .await
            .map_err(|e| AuthError::ParseFailed(e.to_string()))
    }
}

/// Authentication errors
#[derive(Debug, thiserror::Error)]
pub enum AuthError {
    #[error("Request failed: {0}")]
    RequestFailed(String),

    #[error("Token exchange failed: {0}")]
    TokenExchangeFailed(String),

    #[error("Token refresh failed: {0}")]
    TokenRefreshFailed(String),

    #[error("Failed to get user info: {0}")]
    UserInfoFailed(String),

    #[error("Failed to parse response: {0}")]
    ParseFailed(String),

    #[error("Invalid state parameter")]
    InvalidState,

    #[error("Missing authorization code")]
    MissingCode,
}
