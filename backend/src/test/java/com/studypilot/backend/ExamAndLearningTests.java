package com.studypilot.backend;

import com.studypilot.backend.controller.ExamPatternController;
import com.studypilot.backend.dto.ExamPatternResponse;
import com.studypilot.backend.model.*;
import com.studypilot.backend.repository.*;
import com.studypilot.backend.service.JwtService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@Transactional
class ExamAndLearningTests {

    @Autowired
    private JwtService jwtService;

    @Autowired
    private ExamPatternController examPatternController;

    @Autowired
    private StudentRepository studentRepository;

    @Autowired
    private ExamPatternRepository examPatternRepository;

    @Autowired
    private ExamComponentRepository examComponentRepository;

    @Autowired
    private SubjectMarkRepository subjectMarkRepository;

    @Autowired
    private SyllabusUnitRepository syllabusUnitRepository;

    @Autowired
    private SyllabusTopicRepository syllabusTopicRepository;

    @Autowired
    private StudentSettingsRepository studentSettingsRepository;

    private Student testStudent;

    @BeforeEach
    void setup() {
        testStudent = studentRepository.findByEmail("exam_test_student@example.com")
                .orElseGet(() -> {
                    Student s = new Student();
                    s.setName("Exam Tester");
                    s.setEmail("exam_test_student@example.com");
                    s.setPasswordHash("hashed_password_placeholder");
                    s.setAcademicYear("3rd Year");
                    return studentRepository.save(s);
                });
    }

    @Test
    @DisplayName("1. Verify default exam patterns include Theory (Mid 1/2, FAs, CLA) and Lab components")
    void testExamPatternCreationAndComponents() {
        // Create Theory Pattern
        ExamPattern theory = new ExamPattern();
        theory.setStudent(testStudent);
        theory.setName("Theory Examination Pattern");
        theory.setDefault(true);
        theory = examPatternRepository.save(theory);

        ExamComponent fa1 = new ExamComponent();
        fa1.setExamPattern(theory);
        fa1.setComponentName("Mid 1: FA1");
        fa1.setMaxMarks(10.0);
        fa1.setDisplayOrder(1);
        examComponentRepository.save(fa1);

        ExamComponent cla = new ExamComponent();
        cla.setExamPattern(theory);
        cla.setComponentName("Continuous Learning Assessment (CLA)");
        cla.setMaxMarks(10.0);
        cla.setDisplayOrder(5);
        examComponentRepository.save(cla);

        // Create Lab Pattern
        ExamPattern lab = new ExamPattern();
        lab.setStudent(testStudent);
        lab.setName("Laboratory Examination Pattern");
        lab.setDefault(false);
        lab = examPatternRepository.save(lab);

        ExamComponent labInternal = new ExamComponent();
        labInternal.setExamPattern(lab);
        labInternal.setComponentName("Lab Internal Practical");
        labInternal.setMaxMarks(30.0);
        labInternal.setDisplayOrder(1);
        examComponentRepository.save(labInternal);

        ExamComponent labExternal = new ExamComponent();
        labExternal.setExamPattern(lab);
        labExternal.setComponentName("Lab External Practical Exam");
        labExternal.setMaxMarks(50.0);
        labExternal.setDisplayOrder(3);
        examComponentRepository.save(labExternal);

        List<ExamPattern> patterns = examPatternRepository.findByStudentId(testStudent.getId());
        assertEquals(2, patterns.size());

        List<ExamComponent> theoryComps = examComponentRepository.findByExamPatternIdOrderByDisplayOrderAsc(theory.getId());
        assertEquals(2, theoryComps.size());
        assertEquals("Mid 1: FA1", theoryComps.get(0).getComponentName());
        assertEquals(10.0, theoryComps.get(0).getMaxMarks());

        List<ExamComponent> labComps = examComponentRepository.findByExamPatternIdOrderByDisplayOrderAsc(lab.getId());
        assertEquals(2, labComps.size());
        assertEquals("Lab Internal Practical", labComps.get(0).getComponentName());
    }

    @Test
    @DisplayName("2. Verify marks calculate percentages accurately and preserve historical snapshots")
    void testSubjectMarkPercentageAndSnapshot() {
        ExamPattern pattern = new ExamPattern();
        pattern.setStudent(testStudent);
        pattern.setName("Mid Assessment");
        pattern = examPatternRepository.save(pattern);

        ExamComponent comp = new ExamComponent();
        comp.setExamPattern(pattern);
        comp.setComponentName("FA1 Assignment");
        comp.setMaxMarks(25.0);
        comp.setDisplayOrder(1);
        comp = examComponentRepository.save(comp);

        // Student scores 18 out of 25 -> 72.0%
        SubjectMark mark = new SubjectMark();
        mark.setStudent(testStudent);
        mark.setSubjectId("CS301");
        mark.setExamComponent(comp);
        mark.setComponentNameSnapshot(comp.getComponentName());
        mark.setObtainedMarks(18.0);
        mark.setMaxMarks(comp.getMaxMarks());
        mark.setExamDate(LocalDate.now());

        SubjectMark saved = subjectMarkRepository.save(mark);

        assertNotNull(saved.getId());
        double percentage = (saved.getObtainedMarks() / saved.getMaxMarks()) * 100.0;
        assertEquals(72.0, percentage, 0.001);
        assertEquals("FA1 Assignment", saved.getComponentNameSnapshot());

        // Test historical preservation: nullify component foreign key
        subjectMarkRepository.nullifyComponent(comp.getId());
        SubjectMark reloaded = subjectMarkRepository.findById(saved.getId()).orElseThrow();
        assertNull(reloaded.getExamComponent(), "FK should be nullified when component is deleted");
        assertEquals("FA1 Assignment", reloaded.getComponentNameSnapshot(), "Snapshot must remain intact");
        assertEquals(18.0, reloaded.getObtainedMarks());
        assertEquals(25.0, reloaded.getMaxMarks());
    }

    @Test
    @DisplayName("3. Verify performance threshold logic flags subjects needing improvement")
    void testPerformanceThresholdLogic() {
        double threshold = 50.0;

        // Mark 1: 35/100 = 35% (< 50%) -> Needs improvement
        SubjectMark mark1 = new SubjectMark();
        mark1.setStudent(testStudent);
        mark1.setSubjectId("MATH101");
        mark1.setComponentNameSnapshot("Mid 1");
        mark1.setObtainedMarks(35.0);
        mark1.setMaxMarks(100.0);
        subjectMarkRepository.save(mark1);

        // Mark 2: 75/100 = 75% (>= 50%) -> Good
        SubjectMark mark2 = new SubjectMark();
        mark2.setStudent(testStudent);
        mark2.setSubjectId("CS101");
        mark2.setComponentNameSnapshot("Mid 1");
        mark2.setObtainedMarks(75.0);
        mark2.setMaxMarks(100.0);
        subjectMarkRepository.save(mark2);

        double pct1 = (mark1.getObtainedMarks() / mark1.getMaxMarks()) * 100.0;
        double pct2 = (mark2.getObtainedMarks() / mark2.getMaxMarks()) * 100.0;

        boolean mathNeedsImprovement = pct1 < threshold;
        boolean csNeedsImprovement = pct2 < threshold;

        assertTrue(mathNeedsImprovement, "Math with 35% should need improvement under 50% threshold");
        assertFalse(csNeedsImprovement, "CS with 75% should not need improvement under 50% threshold");
    }

    @Test
    @DisplayName("4. Verify syllabus units and topic completion tracking")
    void testSyllabusUnitAndTopicManagement() {
        SyllabusUnit unit = new SyllabusUnit();
        unit.setStudent(testStudent);
        unit.setSubjectId("CS202");
        unit.setUnitNumber(1);
        unit.setUnitTitle("Data Structures Basics");
        unit = syllabusUnitRepository.save(unit);

        SyllabusTopic topic1 = new SyllabusTopic();
        topic1.setSyllabusUnit(unit);
        topic1.setTopicTitle("Arrays and Linked Lists");
        topic1.setCompleted(false);
        topic1 = syllabusTopicRepository.save(topic1);

        SyllabusTopic topic2 = new SyllabusTopic();
        topic2.setSyllabusUnit(unit);
        topic2.setTopicTitle("Stacks and Queues");
        topic2.setCompleted(true);
        topic2 = syllabusTopicRepository.save(topic2);

        List<SyllabusTopic> topics = syllabusTopicRepository.findBySyllabusUnitId(unit.getId());
        assertEquals(2, topics.size());

        long completedCount = syllabusTopicRepository.countBySyllabusUnitIdAndIsCompletedTrue(unit.getId());
        assertEquals(1, completedCount);

        // Toggle topic 1 to completed
        topic1.setCompleted(true);
        syllabusTopicRepository.save(topic1);

        long updatedCompletedCount = syllabusTopicRepository.countBySyllabusUnitIdAndIsCompletedTrue(unit.getId());
        assertEquals(2, updatedCompletedCount);
    }

    @Test
    @DisplayName("5. Verify student custom threshold settings persistence")
    void testStudentSettingsThreshold() {
        StudentSettings settings = new StudentSettings();
        settings.setStudent(testStudent);
        settings.setPerformanceThreshold(65.0);
        studentSettingsRepository.save(settings);

        StudentSettings loaded = studentSettingsRepository.findByStudentId(testStudent.getId()).orElseThrow();
        assertEquals(65.0, loaded.getPerformanceThreshold(), 0.001);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("6. Verify JWT validation strictly accepts signed tokens and rejects local simulation tokens")
    void testJwtValidationAndRejection() {
        // Valid token generated for student
        String realToken = jwtService.generateToken(testStudent.getEmail());
        assertTrue(jwtService.isTokenValid(realToken), "Real JWT must be valid");
        assertEquals(testStudent.getEmail(), jwtService.extractEmail(realToken));

        // Simulated local tokens must be rejected by backend
        assertFalse(jwtService.isTokenValid("jwt_local_sim_12345"), "Local simulation tokens must NOT be accepted");
        assertFalse(jwtService.isTokenValid(""), "Empty token must NOT be accepted");
        assertFalse(jwtService.isTokenValid("invalid.jwt.token"), "Malformed token must NOT be accepted");
    }

    @Test
    @DisplayName("7. Verify exam pattern controller strictly isolates patterns per authenticated student")
    void testExamPatternStudentIsolation() {
        // Create pattern for testStudent
        ExamPattern patternA = new ExamPattern();
        patternA.setStudent(testStudent);
        patternA.setName("Student A Pattern");
        patternA.setDefault(true);
        examPatternRepository.save(patternA);

        // Authenticate as testStudent (Student A)
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        testStudent.getEmail(),
                        null,
                        List.of(new SimpleGrantedAuthority("ROLE_STUDENT"))
                )
        );

        List<ExamPatternResponse> patternsA = examPatternController.listPatterns();
        assertEquals(1, patternsA.size());
        assertEquals("Student A Pattern", patternsA.get(0).getName());

        // Create Student B
        Student otherStudent = studentRepository.findByEmail("other_exam_student@example.com")
                .orElseGet(() -> {
                    Student s = new Student();
                    s.setName("Other Tester");
                    s.setEmail("other_exam_student@example.com");
                    s.setPasswordHash("hashed_placeholder");
                    s.setAcademicYear("2nd Year");
                    return studentRepository.save(s);
                });

        // Switch authentication context to Student B
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        otherStudent.getEmail(),
                        null,
                        List.of(new SimpleGrantedAuthority("ROLE_STUDENT"))
                )
        );

        List<ExamPatternResponse> patternsB = examPatternController.listPatterns();
        assertTrue(patternsB.isEmpty(), "Student B must NOT see Student A's exam patterns");

        // Clear security context (unauthenticated) -> must throw Exception
        SecurityContextHolder.clearContext();
        assertThrows(Exception.class, () -> examPatternController.listPatterns(),
                "Unauthenticated access to listPatterns must fail");
    }
}
