package com.studypilot.backend.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import jakarta.validation.constraints.*;

/**
 * Student entity — persisted to the `students` table in MySQL.
 * passwordHash is excluded from all JSON serialization.
 */
@Entity
@Table(name = "students")
public class Student {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @NotBlank
    @Column(nullable = false)
    private String name;

    @Email
    @Column(unique = true, nullable = false)
    private String email;

    @JsonIgnore
    @Column(nullable = false)
    private String passwordHash;

    @Min(10)
    @Max(120)
    private Integer age;

    private String gender;

    private String academicYear;

    private String birthday;

    // -------------------------------------------------------------------------
    // Constructors
    // -------------------------------------------------------------------------

    public Student() {}

    // -------------------------------------------------------------------------
    // Getters & Setters
    // -------------------------------------------------------------------------

    public Long getId()                     { return id; }
    public void setId(Long id)             { this.id = id; }

    public String getName()                 { return name; }
    public void setName(String name)       { this.name = name; }

    public String getEmail()               { return email; }
    public void setEmail(String email)     { this.email = email; }

    public String getPasswordHash()                   { return passwordHash; }
    public void setPasswordHash(String passwordHash)  { this.passwordHash = passwordHash; }

    public Integer getAge()                { return age; }
    public void setAge(Integer age)       { this.age = age; }

    public String getGender()              { return gender; }
    public void setGender(String gender)  { this.gender = gender; }

    public String getAcademicYear()                  { return academicYear; }
    public void setAcademicYear(String academicYear) { this.academicYear = academicYear; }

    public String getBirthday()                { return birthday; }
    public void setBirthday(String birthday)  { this.birthday = birthday; }
}

