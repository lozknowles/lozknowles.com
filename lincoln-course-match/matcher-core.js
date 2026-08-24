export const SUBJECT_ALIASES = {
  'maths': 'Mathematics', 'math': 'Mathematics', 'mathematics': 'Mathematics',
  'english': 'English Language', 'english language': 'English Language', 'eng lang': 'English Language',
  'english literature': 'English Literature', 'eng lit': 'English Literature',
  'combined science': 'Combined Science', 'science': 'Combined Science',
  'physics': 'Physics', 'chemistry': 'Chemistry', 'biology': 'Biology',
  'geography': 'Geography', 'history': 'History', 'art': 'Art & Design', 'art and design': 'Art & Design',
  'ict': 'Computing', 'computer science': 'Computing', 'computing': 'Computing',
  'business': 'Business', 'sport': 'Sport', 'pe': 'Sport'
};

export function normaliseSubject(subject = '') {
  const key = String(subject).trim().toLowerCase().replace(/\s+/g, ' ');
  return SUBJECT_ALIASES[key] || String(subject).trim().replace(/\b\w/g, c => c.toUpperCase());
}

export function parseGrade(value) {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return null;
  const pair = raw.match(/^([1-9])\s*[-/]\s*([1-9])$/);
  if (pair) return { type: 'pair', values: [Number(pair[1]), Number(pair[2])], raw };
  const numeric = raw.match(/^[1-9]$/);
  if (numeric) return { type: 'single', value: Number(raw), raw };
  const legacy = { A: 7, B: 6, C: 4, D: 3, E: 2, F: 1, G: 1 };
  if (legacy[raw]) return { type: 'single', value: legacy[raw], raw, converted: true };
  return { type: 'text', raw };
}

export function numericGrade(value) {
  const grade = typeof value === 'object' && value?.type ? value : parseGrade(value);
  if (!grade) return null;
  if (grade.type === 'single') return grade.value;
  if (grade.type === 'pair') return Math.min(...grade.values);
  return null;
}

export function normaliseGrades(rows = []) {
  return rows
    .filter(row => row && String(row.subject || '').trim() && String(row.grade ?? '').trim())
    .map(row => ({ subject: normaliseSubject(row.subject), grade: parseGrade(row.grade), rawGrade: String(row.grade).trim() }));
}

export function countQualificationsAtOrAbove(grades, threshold) {
  let count = 0;
  for (const row of grades) {
    if (row.subject === 'Combined Science' && row.grade?.type === 'pair') {
      count += row.grade.values.filter(v => v >= threshold).length;
    } else if (numericGrade(row.grade) >= threshold) {
      count += 1;
    }
  }
  return count;
}

export function getGrade(grades, subject) {
  const wanted = normaliseSubject(subject);
  const row = grades.find(g => normaliseSubject(g.subject) === wanted);
  return row ? numericGrade(row.grade) : null;
}

export function hasSubjectAtOrAbove(grades, subjects, threshold) {
  return subjects.some(subject => (getGrade(grades, subject) ?? -1) >= threshold);
}

function evaluateRule(grades, rule) {
  const checks = [];
  let hardFailures = 0;
  let gaps = 0;

  if (rule.minTotal) {
    const got = countQualificationsAtOrAbove(grades, rule.minTotal.grade);
    const need = rule.minTotal.count;
    const pass = got >= need;
    checks.push({ pass, label: `${need} GCSEs at grade ${rule.minTotal.grade}+`, detail: `${got} evidenced` });
    if (!pass) { hardFailures += 1; gaps += Math.max(0, need - got); }
  }

  for (const req of rule.subjects || []) {
    const got = getGrade(grades, req.subject);
    const pass = got !== null && got >= req.grade;
    checks.push({ pass, label: `${req.subject} grade ${req.grade}+`, detail: got === null ? 'not evidenced' : `grade ${got}` });
    if (!pass) { hardFailures += 1; gaps += got === null ? 1 : Math.max(0, req.grade - got); }
  }

  for (const req of rule.anySubjects || []) {
    const pass = hasSubjectAtOrAbove(grades, req.subjects, req.grade);
    checks.push({ pass, label: `${req.subjects.join(' or ')} grade ${req.grade}+`, detail: pass ? 'evidenced' : 'not evidenced' });
    if (!pass) { hardFailures += 1; gaps += 1; }
  }

  if (rule.noFormalGrades) {
    checks.push({ pass: true, label: 'No formal GCSE entry requirement encoded', detail: 'other checks may still apply' });
  }

  return { checks, hardFailures, gaps };
}

export function matchCourse(gradesInput, course) {
  const grades = Array.isArray(gradesInput) && gradesInput[0]?.grade?.type ? gradesInput : normaliseGrades(gradesInput);
  const evaluation = evaluateRule(grades, course.rule || {});
  const warnings = [...(course.warnings || [])];
  const combined = grades.find(g => g.subject === 'Combined Science');
  if (combined?.grade?.type === 'single' && (course.rule?.minTotal || course.rule?.anySubjects?.some(r => r.subjects.includes('Combined Science')))) {
    warnings.push('Combined Science is entered as one grade. If this is a double-award result, enter it as a pair such as 5-5 so GCSE counts are not understated.');
  }

  let status = 'green';
  if (evaluation.hardFailures > 0) status = evaluation.gaps <= 2 ? 'amber' : 'red';
  if (course.rule?.manualOnly) status = 'amber';

  const score = status === 'green' ? 100 : status === 'amber' ? 65 - evaluation.gaps * 4 : Math.max(10, 35 - evaluation.gaps * 4);
  return { course, ...evaluation, warnings, status, score };
}

export function rankCourses(gradesInput, courses, interests = [], careerText = '') {
  const interestSet = new Set(interests.map(x => x.toLowerCase()));
  const career = careerText.trim().toLowerCase();
  return courses.map(course => {
    const result = matchCourse(gradesInput, course);
    const interestHit = interestSet.has(course.subject.toLowerCase()) || (course.interests || []).some(x => interestSet.has(x.toLowerCase()));
    const careerHit = Boolean(career) && [course.title, course.subject, ...(course.keywords || [])].join(' ').toLowerCase().includes(career);
    const relevance = (interestSet.size && interestHit ? 25 : 0) + (careerHit ? 10 : 0);
    return { ...result, interestHit, relevance, totalScore: result.score + relevance };
  }).filter(result => !interestSet.size || result.interestHit)
    .sort((a, b) => b.totalScore - a.totalScore || a.course.level - b.course.level || a.course.title.localeCompare(b.course.title));
}

export function parseResultsText(text = '') {
  const cleaned = String(text).replace(/\r/g, '\n');
  const lines = cleaned.split(/\n+/).map(x => x.trim()).filter(Boolean);
  const subjects = [
    'English Language','English Literature','Mathematics','Maths','Combined Science','Biology','Chemistry','Physics','Geography','History','Business','Computer Science','Computing','Art and Design','Art','Sport','Physical Education','PE','French','German','Spanish','Religious Studies','Sociology','Psychology','Economics','Drama','Music'
  ];
  const results = [];
  const seen = new Set();
  for (const line of lines) {
    for (const subject of subjects) {
      const escaped = subject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`\\b${escaped}\\b\\s*(?:[:\\-–]\\s*)?(?:(?:grade|result|gcse)\\s*)?([1-9](?:\\s*[-/]\\s*[1-9])?|[A-G])\\b`, 'i');
      const match = line.match(re);
      if (match) {
        const normal = normaliseSubject(subject);
        const key = normal.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          results.push({ subject: normal, grade: match[1].replace(/\s+/g, '') });
        }
      }
    }
  }
  return results;
}
