//! Helper: `cargo run -p backend --example gen_hash -- <password>`
//! Prints an Argon2id hash of the given password (matches what the auth flow
//! generates at register time). Used to regenerate seed-data hashes.

use argon2::password_hash::{rand_core::OsRng, PasswordHasher, SaltString};
use argon2::Argon2;

fn main() {
    let pw = std::env::args().nth(1).expect("usage: gen_hash <password>");
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(pw.as_bytes(), &salt)
        .expect("argon2")
        .to_string();
    println!("{hash}");
}
