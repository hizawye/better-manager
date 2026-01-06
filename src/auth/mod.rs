//! Authentication module for OAuth flows

mod google;

pub use google::{AuthError, GoogleOAuth, TokenResponse, UserInfo, SCOPES};
