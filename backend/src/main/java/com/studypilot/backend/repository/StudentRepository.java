package com.studypilot.backend.repository;

import com.studypilot.backend.model.Student;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

/**
 * JPA repository for Student entities.
 * Spring Data JPA auto-generates all query implementations.
 */
public interface StudentRepository extends JpaRepository<Student, Long> {

    Optional<Student> findByEmail(String email);

    boolean existsByEmail(String email);

    Optional<Student> findByNameIgnoreCase(String name);

    boolean existsByNameIgnoreCase(String name);
}

