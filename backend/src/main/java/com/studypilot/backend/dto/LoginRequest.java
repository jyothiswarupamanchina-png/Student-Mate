package com.studypilot.backend.dto;

/**
 * Request body for POST /api/auth/login.
 *
 * The frontend sends both `email` and `name` set to the same identifier
 * the student typed.  The backend tries email lookup first, then name.
 */
public class LoginRequest {

    private String email;    // may contain an email address or a plain name
    private String name;     // fallback identifier
    private String password;

    // -------------------------------------------------------------------------
    // Getters & Setters
    // -------------------------------------------------------------------------

    public String getEmail()                 { return email; }
    public void setEmail(String email)       { this.email = email; }

    public String getName()                  { return name; }
    public void setName(String name)         { this.name = name; }

    public String getPassword()              { return password; }
    public void setPassword(String password) { this.password = password; }
}

