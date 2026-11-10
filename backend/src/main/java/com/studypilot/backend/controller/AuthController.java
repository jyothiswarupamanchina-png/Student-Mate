package com.studypilot.backend.controller;

import com.studypilot.backend.dto.AuthResponse;
import com.studypilot.backend.dto.LoginRequest;
import com.studypilot.backend.dto.RegisterRequest;
import com.studypilot.backend.model.Student;
import com.studypilot.backend.repository.StudentRepository;
import com.studypilot.backend.service.JwtService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Authentication controller — open to unauthenticated requests.
 *
 * POST /api/auth/register  — create a new student account
 * POST /api/auth/login     — verify credentials, return JWT
 *
 * Passwords are NEVER logged or included in any response body.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final StudentRepository studentRepository;
    private final PasswordEncoder   passwordEncoder;
    private final JwtService        jwtService;

    public AuthController(StudentRepository studentRepository,
                          PasswordEncoder   passwordEncoder,
                          JwtService        jwtService) {
        this.studentRepository = studentRepository;
        this.passwordEncoder   = passwordEncoder;
        this.jwtService        = jwtService;
    }

    // =========================================================================
    // POST /api/auth/register
    // =========================================================================

    @PostMapping("/register")
    public ResponseEntity<?> register(@Valid @RequestBody RegisterRequest request,
                                      BindingResult bindingResult) {

        // 1. Return validation errors early
        if (bindingResult.hasErrors()) {
            Map<String, String> errors = new HashMap<>();
            bindingResult.getFieldErrors()
                         .forEach(e -> errors.put(e.getField(), e.getDefaultMessage()));
            return ResponseEntity.badRequest().body(Map.of("errors", errors));
        }

        String name = request.getName().trim();

        // 2. Check name uniqueness (consistent with frontend local fallback)
        if (studentRepository.existsByNameIgnoreCase(name)) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "An account with this student name already exists. Please sign in."));
        }

        // 3. Determine email — auto-generate from name if the frontend omitted it
        String email;
        if (request.getEmail() != null && !request.getEmail().isBlank()) {
            email = request.getEmail().toLowerCase().trim();
            if (studentRepository.existsByEmail(email)) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "An account with this email already exists."));
            }
        } else {
            String slug = name.toLowerCase().replaceAll("[^a-z0-9]", "");
            if (slug.isEmpty()) slug = "student";
            email = slug + "@studypilot.local";
            // Handle the rare slug collision
            if (studentRepository.existsByEmail(email)) {
                email = slug + System.currentTimeMillis() + "@studypilot.local";
            }
        }

        // 4. Build and persist entity (BCrypt hashes the password — never stored raw)
        Student student = new Student();
        student.setName(name);
        student.setEmail(email);
        student.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        student.setAge(request.getAge());
        student.setGender(request.getGender());
        student.setAcademicYear(request.getAcademicYear());
        student.setBirthday(request.getBirthday());

        student = studentRepository.save(student);

        // 5. Issue JWT and return safe response (no passwordHash exposed)
        String token = jwtService.generateToken(student.getEmail());
        return ResponseEntity.ok(AuthResponse.from(student, token));
    }

    // =========================================================================
    // POST /api/auth/login
    // =========================================================================

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest request) {

        if (request.getPassword() == null || request.getPassword().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Password is required."));
        }

        Optional<Student> studentOpt = resolveStudent(request);

        if (studentOpt.isEmpty()) {
            return ResponseEntity.status(401)
                    .body(Map.of("error", "Student account not found. Please verify your name or email."));
        }

        Student student = studentOpt.get();

        // Verify BCrypt hash — timing-safe comparison via passwordEncoder.matches()
        if (!passwordEncoder.matches(request.getPassword(), student.getPasswordHash())) {
            return ResponseEntity.status(401)
                    .body(Map.of("error", "Incorrect password. Please verify your credentials."));
        }

        String token = jwtService.generateToken(student.getEmail());
        return ResponseEntity.ok(AuthResponse.from(student, token));
    }

    // =========================================================================
    // Internal helpers
    // =========================================================================

    /**
     * Try to locate a student by email, then by name.
     * The frontend sends both `email` and `name` set to the typed identifier.
     */
    private Optional<Student> resolveStudent(LoginRequest request) {
        String identifier = (request.getEmail() != null && !request.getEmail().isBlank())
                            ? request.getEmail().trim()
                            : null;

        if (identifier != null) {
            // If it looks like an email address, try email lookup first
            if (identifier.contains("@")) {
                Optional<Student> byEmail = studentRepository.findByEmail(identifier.toLowerCase());
                if (byEmail.isPresent()) return byEmail;
            }
            // Fall back to case-insensitive name lookup
            Optional<Student> byName = studentRepository.findByNameIgnoreCase(identifier);
            if (byName.isPresent()) return byName;
            // Last resort: try as email even without '@'
            Optional<Student> byEmailFallback = studentRepository.findByEmail(identifier.toLowerCase());
            if (byEmailFallback.isPresent()) return byEmailFallback;
        }

        // Try the `name` field if provided separately
        if (request.getName() != null && !request.getName().isBlank()) {
            return studentRepository.findByNameIgnoreCase(request.getName().trim());
        }

        return Optional.empty();
    }
}

