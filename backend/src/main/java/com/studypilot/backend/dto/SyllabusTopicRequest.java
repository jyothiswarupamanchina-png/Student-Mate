package com.studypilot.backend.dto;

public class SyllabusTopicRequest {
    private String topicTitle;
    private boolean isCompleted;

    public String getTopicTitle() { return topicTitle; }
    public void setTopicTitle(String topicTitle) { this.topicTitle = topicTitle; }
    public boolean isCompleted() { return isCompleted; }
    public void setCompleted(boolean completed) { isCompleted = completed; }
}

