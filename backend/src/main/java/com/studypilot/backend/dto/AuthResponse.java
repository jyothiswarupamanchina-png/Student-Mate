package com.studypilot.backend.dto;

import com.studypilot.backend.model.Student;

/**
 * Response envelope returned by both /api/auth/register and /api/auth/login.
 *
 * Shape matches what the existing frontend BackendService expects:
 *   { "token": "<JWT>", "user": { "id", "name", "email", "academicYear", "age", ... } }
 *
 * passwordHash is excluded — the Student entity carries @JsonIgnore on that field,
 * but we use a dedicated UserDto here as an extra safety layer.
 */
public class AuthResponse {

    private String token;
    private UserDto user;

    public AuthResponse(String token, UserDto user) {
        this.token = token;
        this.user  = user;
    }

    // -------------------------------------------------------------------------
    // Factory
    // -------------------------------------------------------------------------

    public static AuthResponse from(Student student, String token) {
        UserDto dto = new UserDto(
            String.valueOf(student.getId()),
            student.getName(),
            student.getEmail(),
            student.getAcademicYear(),
            student.getAge(),
            student.getGender(),
            student.getBirthday()
        );
        return new AuthResponse(token, dto);
    }

    // -------------------------------------------------------------------------
    // Getters
    // -------------------------------------------------------------------------

    public String  getToken() { return token; }
    public UserDto getUser()  { return user; }

    // -------------------------------------------------------------------------
    // Nested DTO (safe — no password field)
    // -------------------------------------------------------------------------

    public static class UserDto {
        private final String  id;
        private final String  name;
        private final String  email;
        private final String  academicYear;
        private final Integer age;
        private final String  gender;
        private final String  birthday;

        public UserDto(String id, String name, String email,
                       String academicYear, Integer age,
                       String gender, String birthday) {
            this.id           = id;
            this.name         = name;
            this.email        = email;
            this.academicYear = academicYear;
            this.age          = age;
            this.gender       = gender;
            this.birthday     = birthday;
        }

        public String  getId()           { return id; }
        public String  getName()         { return name; }
        public String  getEmail()        { return email; }
        public String  getAcademicYear() { return academicYear; }
        public Integer getAge()          { return age; }
        public String  getGender()       { return gender; }
        public String  getBirthday()     { return birthday; }
    }
}

