package com.studypilot.backend;

import com.studypilot.backend.repository.StudentRepository;
import com.studypilot.backend.security.JwtAuthFilter;
import jakarta.servlet.DispatcherType;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

/**
 * Spring Security configuration for StudyPilot backend.
 *
 * Security model:
 *   - Stateless (no server-side session)
 *   - JWT Bearer token authentication via JwtAuthFilter
 *   - BCrypt password hashing
 *   - Public routes:  GET  /api/health
 *                     POST /api/auth/register
 *                     POST /api/auth/login
 *   - All other routes require a valid JWT
 *   - CORS open for local development (all origins / methods / headers)
 *   - CSRF disabled (stateless REST API)
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;

    public SecurityConfig(JwtAuthFilter jwtAuthFilter) {
        this.jwtAuthFilter = jwtAuthFilter;
    }

    // =========================================================================
    // Security filter chain
    // =========================================================================

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            // CORS — handled by corsConfigurationSource() bean below
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))

            // CSRF disabled — stateless REST API uses JWT, not cookies
            .csrf(csrf -> csrf.disable())

            // Stateless — no HttpSession created or used
            .sessionManagement(sm ->
                    sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))

            // Exception handling — return standard 401 JSON for unauthenticated and 403 JSON for forbidden requests
            .exceptionHandling(ex -> ex
                    .authenticationEntryPoint((request, response, authException) -> {
                        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                        response.setContentType("application/json");
                        response.setCharacterEncoding("UTF-8");
                        response.getWriter().write("{\"error\":\"UNAUTHORIZED\",\"message\":\"Authentication required. Please log in.\"}");
                    })
                    .accessDeniedHandler((request, response, accessDeniedException) -> {
                        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                        response.setContentType("application/json");
                        response.setCharacterEncoding("UTF-8");
                        response.getWriter().write("{\"error\":\"FORBIDDEN\",\"message\":\"Access denied.\"}");
                    })
            )

            // Authorization rules
            .authorizeHttpRequests(auth -> auth
                    // Error dispatch and error endpoint — public so internal errors are never masked as 403
                    .dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()
                    .requestMatchers("/error").permitAll()
                    // Health check — public
                    .requestMatchers(HttpMethod.GET,  "/api/health").permitAll()
                    // Auth endpoints — public
                    .requestMatchers(HttpMethod.POST, "/api/auth/register").permitAll()
                    .requestMatchers(HttpMethod.POST, "/api/auth/login").permitAll()
                    // OPTIONS pre-flight — allow for CORS
                    .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                    // Everything else requires a valid JWT
                    .anyRequest().authenticated()
            )

            // JWT filter runs before the standard username/password filter
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    // =========================================================================
    // BCrypt password encoder
    // =========================================================================

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    // =========================================================================
    // UserDetailsService — suppresses the Spring Boot auto-generated password
    // warning and provides a proper DB-backed lookup for future use.
    // =========================================================================

    @Bean
    public UserDetailsService userDetailsService(StudentRepository studentRepository) {
        return username -> studentRepository.findByEmail(username)
                .or(() -> studentRepository.findByNameIgnoreCase(username))
                .map(student -> User.withUsername(student.getEmail())
                        .password(student.getPasswordHash())
                        .roles("STUDENT")
                        .build())
                .orElseThrow(() -> new UsernameNotFoundException(
                        "Student not found: " + username));
    }

    // =========================================================================
    // CORS — permissive for local development
    // Covers file:// (null origin), http://localhost:*, http://127.0.0.1:*
    // =========================================================================

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();

        // allowedOriginPatterns("*") supports both wildcard and null origin (file://)
        config.setAllowedOriginPatterns(List.of("*"));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setExposedHeaders(List.of("Authorization"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
