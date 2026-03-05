#!/usr/bin/env node

/**
 * Fireflies Meeting Analyzer
 *
 * Pure functions for analyzing Fireflies.ai transcript data.
 * No I/O, no API calls - all data passed in as arguments for full testability.
 *
 * @module fireflies-meeting-analyzer
 * @version 1.0.0
 */

const HEALTH_THRESHOLDS = {
  duration: {
    tooShort: 10 * 60,   // < 10 min in seconds
    tooLong: 90 * 60     // > 90 min in seconds
  },
  minParticipants: 2,
  goingDarkDays: 21,
  engagementGapDays: 14,
  highValueAmount: 50000,
  singleThreadedParticipants: 2,
  avgDurationRiskMinutes: 15,
  recentMeetingsWindow: 3
};

/**
 * Analyze the health of a single meeting transcript.
 * @param {Object} transcript - Fireflies transcript object
 * @param {string} [transcript.id] - Transcript ID
 * @param {string} [transcript.title] - Meeting title
 * @param {number} [transcript.duration] - Duration in seconds
 * @param {string[]} [transcript.participants] - Participant email list
 * @param {Object} [transcript.summary] - Summary object
 * @param {string} [transcript.summary.short_summary] - Short summary text
 * @param {string[]} [transcript.summary.action_items] - Action items list
 * @param {Array}  [transcript.sentences] - Sentence array with speaker attribution
 * @returns {{ score: number, healthLevel: string, factors: Array, recommendations: Array }}
 */
function analyzeMeetingHealth(transcript) {
  let score = 100;
  const factors = [];
  const recommendations = [];

  if (!transcript) {
    return {
      score: 0,
      healthLevel: 'LOW',
      factors: [{ factor: 'No Data', description: 'Transcript is null or undefined', impact: -100 }],
      recommendations: ['Ensure transcript data is available before analysis']
    };
  }

  // --- Duration scoring ---
  const durationSec = transcript.duration || 0;
  if (durationSec > 0 && durationSec < HEALTH_THRESHOLDS.duration.tooShort) {
    const impact = -20;
    score += impact;
    factors.push({
      factor: 'Very Short Meeting',
      description: `Duration ${Math.round(durationSec / 60)} min (threshold: ${HEALTH_THRESHOLDS.duration.tooShort / 60} min)`,
      impact
    });
    recommendations.push('Consider scheduling a longer discovery or alignment call');
  } else if (durationSec > HEALTH_THRESHOLDS.duration.tooLong) {
    const impact = -15;
    score += impact;
    factors.push({
      factor: 'Very Long Meeting',
      description: `Duration ${Math.round(durationSec / 60)} min (threshold: ${HEALTH_THRESHOLDS.duration.tooLong / 60} min)`,
      impact
    });
    recommendations.push('Break long meetings into focused sessions to improve engagement');
  }

  // --- Participant count ---
  const participants = Array.isArray(transcript.participants) ? transcript.participants : [];
  if (participants.length < HEALTH_THRESHOLDS.minParticipants) {
    const impact = -15;
    score += impact;
    factors.push({
      factor: 'Low Attendance',
      description: `${participants.length} participant(s) (minimum: ${HEALTH_THRESHOLDS.minParticipants})`,
      impact
    });
    recommendations.push('Ensure key stakeholders are included in future meetings');
  }

  // --- Talk distribution (speaker diversity from sentences) ---
  const sentences = Array.isArray(transcript.sentences) ? transcript.sentences : [];
  if (sentences.length > 0) {
    const speakerWordCounts = {};
    sentences.forEach(s => {
      const speaker = s.speaker_name || s.speaker_id || 'Unknown';
      speakerWordCounts[speaker] = (speakerWordCounts[speaker] || 0) + 1;
    });
    const speakerCount = Object.keys(speakerWordCounts).length;

    if (speakerCount < 2) {
      const impact = -20;
      score += impact;
      factors.push({
        factor: 'One-Sided Conversation',
        description: 'Only one speaker detected across all sentences',
        impact
      });
      recommendations.push('Encourage prospect participation with open-ended questions');
    } else {
      // Check for dominant speaker (> 80% of sentences)
      const totalSentences = sentences.length;
      const dominant = Object.entries(speakerWordCounts)
        .find(([, count]) => count / totalSentences > 0.8);
      if (dominant) {
        const impact = -10;
        score += impact;
        const [dominantSpeaker, dominantCount] = dominant;
        factors.push({
          factor: 'Dominant Speaker',
          description: `${dominantSpeaker} spoke in ${Math.round((dominantCount / totalSentences) * 100)}% of sentences`,
          impact
        });
        recommendations.push('Balance conversation - ask more questions to increase mutual engagement');
      }
    }
  }

  // --- Summary available ---
  const hasSummary = !!(transcript.summary && transcript.summary.short_summary);
  if (!hasSummary) {
    const impact = -10;
    score += impact;
    factors.push({
      factor: 'No Summary',
      description: 'Meeting summary not generated or unavailable',
      impact
    });
    recommendations.push('Ensure Fireflies AI notetaker was active to capture meeting summaries');
  }

  // --- Action items present ---
  const actionItems = transcript.summary && Array.isArray(transcript.summary.action_items)
    ? transcript.summary.action_items
    : [];
  if (hasSummary && actionItems.length === 0) {
    const impact = -10;
    score += impact;
    factors.push({
      factor: 'No Action Items',
      description: 'No action items were detected in the meeting summary',
      impact
    });
    recommendations.push('Conclude meetings with explicit next steps and owner assignments');
  }

  const finalScore = Math.max(0, Math.min(100, score));
  return {
    score: finalScore,
    healthLevel: finalScore >= 70 ? 'HIGH' : finalScore >= 40 ? 'MEDIUM' : 'LOW',
    factors,
    recommendations
  };
}

/**
 * Extract topic trends across a collection of transcripts.
 * Uses summary.keywords and summary.topics_discussed from each transcript.
 * Calculates weekly trends.
 * @param {Array} transcripts - Array of Fireflies transcript objects
 * @returns {{ topics: Array, dateRange: Object }}
 */
function extractTopicTrends(transcripts) {
  if (!transcripts || transcripts.length === 0) {
    return { topics: [], dateRange: { from: null, to: null } };
  }

  // Collect all keywords/topics with dates
  const topicTimeline = {}; // topic -> [{ week }]

  transcripts.forEach(transcript => {
    if (!transcript.summary) return;

    const meetingDate = transcript.dateString ? new Date(transcript.dateString) : null;
    const weekKey = meetingDate ? _getWeekKey(meetingDate) : null;

    const keywords = Array.isArray(transcript.summary.keywords)
      ? transcript.summary.keywords
      : [];
    const topics = Array.isArray(transcript.summary.topics_discussed)
      ? transcript.summary.topics_discussed
      : [];

    [...keywords, ...topics].forEach(rawTopic => {
      const topic = (rawTopic || '').toString().toLowerCase().trim();
      if (!topic) return;

      if (!topicTimeline[topic]) topicTimeline[topic] = [];
      if (weekKey) topicTimeline[topic].push(weekKey);
    });
  });

  // Sort weeks globally
  const allDates = transcripts
    .map(t => t.dateString)
    .filter(Boolean)
    .map(d => new Date(d))
    .sort((a, b) => a - b);

  const dateRange = {
    from: allDates.length > 0 ? allDates[0].toISOString() : null,
    to: allDates.length > 0 ? allDates[allDates.length - 1].toISOString() : null
  };

  // Sort all week keys found
  const allWeeks = [...new Set(
    Object.values(topicTimeline).flat()
  )].sort();

  const topics = Object.entries(topicTimeline)
    .map(([name, weeks]) => {
      const frequency = weeks.length;
      const trend = _calculateTopicTrend(weeks, allWeeks);
      return { name, frequency, trend };
    })
    .sort((a, b) => b.frequency - a.frequency);

  return { topics, dateRange };
}

/**
 * Calculate aggregate engagement metrics across a set of transcripts.
 * @param {Array} transcripts - Array of Fireflies transcript objects
 * @returns {{ totalMeetings, totalDuration, avgDuration, avgParticipants, meetingFrequency, participantBreakdown }}
 */
function calculateEngagementMetrics(transcripts) {
  if (!transcripts || transcripts.length === 0) {
    return {
      totalMeetings: 0,
      totalDuration: 0,
      avgDuration: 0,
      avgParticipants: 0,
      meetingFrequency: null,
      participantBreakdown: []
    };
  }

  let totalDuration = 0;
  let totalParticipants = 0;
  const participantFrequency = {};
  const meetingDates = [];

  transcripts.forEach(transcript => {
    totalDuration += transcript.duration || 0;

    const participants = Array.isArray(transcript.participants) ? transcript.participants : [];
    totalParticipants += participants.length;

    participants.forEach(email => {
      const key = (email || '').toLowerCase().trim();
      if (key) participantFrequency[key] = (participantFrequency[key] || 0) + 1;
    });

    if (transcript.dateString) {
      meetingDates.push(new Date(transcript.dateString));
    }
  });

  meetingDates.sort((a, b) => a - b);

  // Meeting frequency: avg days between meetings
  let meetingFrequency = null;
  if (meetingDates.length >= 2) {
    const spanMs = meetingDates[meetingDates.length - 1] - meetingDates[0];
    const spanDays = spanMs / (1000 * 60 * 60 * 24);
    meetingFrequency = Math.round(spanDays / (meetingDates.length - 1) * 10) / 10; // avg days between
  }

  const participantBreakdown = Object.entries(participantFrequency)
    .map(([email, meetingsAttended]) => ({ email, meetingsAttended }))
    .sort((a, b) => b.meetingsAttended - a.meetingsAttended);

  return {
    totalMeetings: transcripts.length,
    totalDuration,
    avgDuration: Math.round(totalDuration / transcripts.length),
    avgParticipants: Math.round((totalParticipants / transcripts.length) * 10) / 10,
    meetingFrequency,
    participantBreakdown
  };
}

/**
 * Detect deal risk signals across transcripts, cross-referenced with opportunity data.
 * @param {Array} transcripts - Array of Fireflies transcript objects
 * @param {Array} opportunities - Array of opportunity/deal objects { id, amount, name, lastActivityDate }
 * @returns {{ deals: Array }}
 */
function detectRiskSignals(transcripts, opportunities) {
  if (!opportunities || opportunities.length === 0) {
    return { deals: [] };
  }

  // Index transcripts by participant email -> transcripts
  const transcriptsByParticipant = {};
  transcripts.forEach(transcript => {
    const participants = Array.isArray(transcript.participants) ? transcript.participants : [];
    participants.forEach(email => {
      const key = (email || '').toLowerCase().trim();
      if (key) {
        if (!transcriptsByParticipant[key]) transcriptsByParticipant[key] = [];
        transcriptsByParticipant[key].push(transcript);
      }
    });
  });

  const deals = opportunities.map(opportunity => {
    const oppId = opportunity.id || opportunity.Id;
    const amount = opportunity.amount || opportunity.Amount || 0;

    // Gather transcripts associated with this opportunity
    // Primary linkage: contacts on the opportunity matched against participant emails
    const contactEmails = (opportunity.contactEmails || []).map(e => e.toLowerCase().trim());
    const relatedTranscripts = contactEmails.length > 0
      ? [...new Set(contactEmails.flatMap(email => transcriptsByParticipant[email] || []))]
      : [];

    let riskScore = 0;
    const riskFactors = [];
    const recommendations = [];

    if (relatedTranscripts.length === 0) {
      // No meetings found at all
      riskScore += 50;
      riskFactors.push({
        factor: 'No Meetings Found',
        description: 'No Fireflies transcripts matched to this opportunity',
        impact: 50
      });
      recommendations.push('Ensure meeting participants include known opportunity contacts');
    } else {
      // Sort by date descending
      const sorted = [...relatedTranscripts].sort((a, b) =>
        new Date(b.dateString || 0) - new Date(a.dateString || 0)
      );
      const lastMeetingDate = sorted[0].dateString ? new Date(sorted[0].dateString) : null;
      const daysSinceLast = lastMeetingDate
        ? Math.floor((Date.now() - lastMeetingDate) / (1000 * 60 * 60 * 24))
        : null;

      // Going dark check
      if (daysSinceLast !== null && daysSinceLast >= HEALTH_THRESHOLDS.goingDarkDays) {
        const impact = 25;
        riskScore += impact;
        riskFactors.push({
          factor: 'Going Dark',
          description: `${daysSinceLast} days since last meeting (threshold: ${HEALTH_THRESHOLDS.goingDarkDays})`,
          impact
        });
        recommendations.push(`Schedule follow-up immediately - ${daysSinceLast} days since last conversation`);
      } else if (daysSinceLast !== null && daysSinceLast >= HEALTH_THRESHOLDS.engagementGapDays) {
        const impact = 15;
        riskScore += impact;
        riskFactors.push({
          factor: 'Engagement Gap',
          description: `${daysSinceLast} days since last meeting (threshold: ${HEALTH_THRESHOLDS.engagementGapDays})`,
          impact
        });
        recommendations.push(`Follow up soon - ${daysSinceLast} days since last conversation`);
      }

      // Single-threaded check (unique participant emails across all related transcripts)
      const uniqueParticipants = new Set();
      relatedTranscripts.forEach(t => {
        (Array.isArray(t.participants) ? t.participants : []).forEach(email => {
          uniqueParticipants.add((email || '').toLowerCase().trim());
        });
      });

      if (uniqueParticipants.size < HEALTH_THRESHOLDS.singleThreadedParticipants && amount > HEALTH_THRESHOLDS.highValueAmount) {
        const impact = 15;
        riskScore += impact;
        riskFactors.push({
          factor: 'Single-threaded',
          description: `Only ${uniqueParticipants.size} unique participant(s) on $${amount.toLocaleString()} deal`,
          impact
        });
        recommendations.push('Expand contacts - identify and engage additional stakeholders');
      }

      // Short meetings check
      const avgDurationMin = relatedTranscripts.length > 0
        ? relatedTranscripts.reduce((sum, t) => sum + (t.duration || 0), 0) / relatedTranscripts.length / 60
        : 0;
      if (avgDurationMin > 0 && avgDurationMin < HEALTH_THRESHOLDS.avgDurationRiskMinutes) {
        const impact = 10;
        riskScore += impact;
        riskFactors.push({
          factor: 'Short Meetings',
          description: `Average meeting duration ${Math.round(avgDurationMin)} min (threshold: ${HEALTH_THRESHOLDS.avgDurationRiskMinutes} min)`,
          impact
        });
        recommendations.push('Schedule deeper discovery sessions - very short meetings indicate low engagement');
      }

      // No action items in recent meetings check
      const recentTranscripts = sorted.slice(0, HEALTH_THRESHOLDS.recentMeetingsWindow);
      const recentWithActionItems = recentTranscripts.filter(t =>
        t.summary &&
        Array.isArray(t.summary.action_items) &&
        t.summary.action_items.length > 0
      );
      if (recentTranscripts.length >= HEALTH_THRESHOLDS.recentMeetingsWindow && recentWithActionItems.length === 0) {
        const impact = 10;
        riskScore += impact;
        riskFactors.push({
          factor: 'No Action Items',
          description: `No action items detected in last ${HEALTH_THRESHOLDS.recentMeetingsWindow} meetings`,
          impact
        });
        recommendations.push('Ensure meetings conclude with clear next steps and owner assignments');
      }
    }

    const finalScore = Math.min(riskScore, 100);
    return {
      opportunityId: oppId,
      opportunityName: opportunity.name || opportunity.Name || null,
      riskScore: finalScore,
      riskLevel: finalScore >= 50 ? 'HIGH' : finalScore >= 25 ? 'MEDIUM' : 'LOW',
      riskFactors,
      recommendations,
      meetingCount: relatedTranscripts.length
    };
  });

  // Sort by risk score descending
  deals.sort((a, b) => b.riskScore - a.riskScore);

  return { deals };
}

/**
 * Analyze per-participant engagement across a set of transcripts.
 * Uses the sentences array to calculate per-speaker talk time metrics.
 * @param {Array} transcripts - Array of Fireflies transcript objects with sentences
 * @returns {Array} Per-participant stats sorted by total talk time desc
 */
function analyzeParticipantEngagement(transcripts) {
  if (!transcripts || transcripts.length === 0) return [];

  const participantStats = {};

  transcripts.forEach(transcript => {
    const sentences = Array.isArray(transcript.sentences) ? transcript.sentences : [];

    // Track meeting attendance per participant email
    const participantEmails = Array.isArray(transcript.participants) ? transcript.participants : [];
    participantEmails.forEach(email => {
      const key = (email || '').toLowerCase().trim();
      if (!key) return;
      if (!participantStats[key]) {
        participantStats[key] = {
          email: key,
          meetingsAttended: 0,
          totalTalkTimeSeconds: 0,
          avgSentenceCount: 0,
          _sentenceCounts: [],
          _speakerIds: new Set()
        };
      }
      participantStats[key].meetingsAttended++;
    });

    // Aggregate per-speaker sentence metrics from this transcript
    const speakerSentences = {};
    const speakerTalkTime = {};

    sentences.forEach(sentence => {
      const speakerId = sentence.speaker_id || sentence.speaker_name || 'unknown';
      const speakerName = sentence.speaker_name || speakerId;

      if (!speakerSentences[speakerId]) {
        speakerSentences[speakerId] = { count: 0, name: speakerName };
        speakerTalkTime[speakerId] = 0;
      }

      speakerSentences[speakerId].count++;

      // Talk time: difference between end_time and start_time (seconds)
      const start = typeof sentence.start_time === 'number' ? sentence.start_time : 0;
      const end = typeof sentence.end_time === 'number' ? sentence.end_time : start;
      speakerTalkTime[speakerId] += Math.max(0, end - start);
    });

    // Attempt to match speaker IDs to participant emails by name/position
    // Since Fireflies doesn't always map speaker_id to email, we do best-effort
    // by associating aggregated speaker stats back to participants if only 1 speaker unmatched
    Object.entries(speakerSentences).forEach(([speakerId, stats]) => {
      // Try to find a participant whose email or name matches
      const matchedEmail = participantEmails.find(email => {
        const emailUser = email.split('@')[0].toLowerCase();
        return emailUser === (stats.name || '').toLowerCase().replace(/\s+/g, '.');
      });

      const targetKey = matchedEmail ? matchedEmail.toLowerCase() : null;

      if (targetKey && participantStats[targetKey]) {
        participantStats[targetKey].totalTalkTimeSeconds += speakerTalkTime[speakerId] || 0;
        participantStats[targetKey]._sentenceCounts.push(stats.count);
        participantStats[targetKey]._speakerIds.add(speakerId);
      }
    });
  });

  // Finalize stats
  return Object.values(participantStats)
    .map(stat => {
      const sentenceCounts = stat._sentenceCounts;
      const avgSentenceCount = sentenceCounts.length > 0
        ? Math.round(sentenceCounts.reduce((a, b) => a + b, 0) / sentenceCounts.length)
        : 0;

      return {
        email: stat.email,
        meetingsAttended: stat.meetingsAttended,
        totalTalkTimeSeconds: Math.round(stat.totalTalkTimeSeconds),
        avgSentenceCount
      };
    })
    .sort((a, b) => b.totalTalkTimeSeconds - a.totalTalkTimeSeconds);
}

// ── Private Helpers ──

function _getWeekKey(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay()); // Set to Sunday
  return d.toISOString().slice(0, 10);
}

function _calculateTopicTrend(topicWeeks, allWeeks) {
  if (allWeeks.length < 4 || topicWeeks.length < 2) return 'stable';

  const midpoint = Math.floor(allWeeks.length / 2);
  const recentWeeks = new Set(allWeeks.slice(midpoint));
  const earlierWeeks = new Set(allWeeks.slice(0, midpoint));

  const recentCount = topicWeeks.filter(w => recentWeeks.has(w)).length;
  const earlierCount = topicWeeks.filter(w => earlierWeeks.has(w)).length;

  if (recentCount > earlierCount * 1.2) return 'increasing';
  if (recentCount < earlierCount * 0.8) return 'decreasing';
  return 'stable';
}

module.exports = {
  analyzeMeetingHealth,
  extractTopicTrends,
  calculateEngagementMetrics,
  detectRiskSignals,
  analyzeParticipantEngagement,
  HEALTH_THRESHOLDS
};
