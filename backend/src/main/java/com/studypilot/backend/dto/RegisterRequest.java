package com.studypilot.backend.dto;

import jakarta.validation.constraints.*;

/**
 * Request body for POST /api/auth/register.
 *
 * email is optional — the backend auto-generates one from the student name
 * when the frontend omits it (the registration form only collects
 * name, academicYear, age and password).
 */
public class RegisterRequest {

    @NotBlank(message = "Name is required")
    private String name;

    @NotBlank(message = "Password is required")
    @Size(min = 4, message = "Password must be at least 4 characters")
    private String password;

    // Optional — may be absent when called from the existing 4-field frontend form
    @Email(message = "Invalid email format")
    private String email;

    @Min(value = 10, message = "Age must be at least 10")
    @Max(value = 120, message = "Age must be at most 120")
    private Integer age;

    private String gender;
    private String academicYear;
    private String birthday;

    // -------------------------------------------------------------------------
    // Getters & Setters
    // -------------------------------------------------------------------------

    public String getName()                    { return name; }
    public void setName(String name)           { this.name = name; }

    public String getPassword()                { return password; }
    public void setPassword(String password)   { this.password = password; }

    public String getEmail()                   { return email; }
    public void setEmail(String email)         { this.email = email; }

    public Integer getAge()                    { return age; }
    public void setAge(Integer age)            { this.age = age; }

    public String getGender()                  { return gender; }
    public void setGender(String gender)       { this.gender = gender; }

    public String getAcademicYear()            { return academicYear; }
    public void setAcademicYear(String y)      { this.academicYear = y; }

    public String getBirthday()                { return birthday; }
    public void setBirthday(String birthday)   { this.birthday = birthday; }
}

