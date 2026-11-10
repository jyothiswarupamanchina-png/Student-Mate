package com.studypilot.backend.dto;

import com.studypilot.backend.model.SyllabusTopic;
import com.studypilot.backend.model.SyllabusUnit;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

public class SyllabusUnitResponse {
    private Long id;
    private String subjectId;
    private int unitNumber;
    private String unitTitle;
    private String description;
    private List<TopicDto> topics;
    private long completedTopics;
    private long totalTopics;

    public static class TopicDto {
        private Long id;
        private String topicTitle;
        private boolean isCompleted;
        private LocalDateTime completedAt;

        public static TopicDto from(SyllabusTopic t) {
            TopicDto dto = new TopicDto();
            dto.id = t.getId();
            dto.topicTitle = t.getTopicTitle();
            dto.isCompleted = t.isCompleted();
            dto.completedAt = t.getCompletedAt();
            return dto;
        }

        public Long getId() { return id; }
        public String getTopicTitle() { return topicTitle; }
        public boolean isCompleted() { return isCompleted; }
        public LocalDateTime getCompletedAt() { return completedAt; }
    }

    public static SyllabusUnitResponse from(SyllabusUnit u) {
        SyllabusUnitResponse dto = new SyllabusUnitResponse();
        dto.id = u.getId();
        dto.subjectId = u.getSubjectId();
        dto.unitNumber = u.getUnitNumber();
        dto.unitTitle = u.getUnitTitle();
        dto.description = u.getDescription();
        dto.topics = u.getTopics().stream().map(TopicDto::from).collect(Collectors.toList());
        dto.completedTopics = u.getTopics().stream().filter(SyllabusTopic::isCompleted).count();
        dto.totalTopics = u.getTopics().size();
        return dto;
    }

    public Long getId() { return id; }
    public String getSubjectId() { return subjectId; }
    public int getUnitNumber() { return unitNumber; }
    public String getUnitTitle() { return unitTitle; }
    public String getDescription() { return description; }
    public List<TopicDto> getTopics() { return topics; }
    public long getCompletedTopics() { return completedTopics; }
    public long getTotalTopics() { return totalTopics; }
}

