export const SUBJECTS = [
  'A Levels','Air & Space Institute (ASI)','Animal Care','Automotive Engineering','Beauty','Business','Care College','Catering','Childcare','Computing','Construction','Creative Arts','Engineering','ESOL','Events Management','Hair - Lee Stafford Academy','Health and Social Care','Media','Music','Performing Arts & Dance','Policing College','Sport','Supported Education','Teaching','T Levels','Theatre Production','Uniformed Public Services'
];

const checked = '2026-08-24';

export const COURSES = [
  {
    id:'a-level-programme', title:'Level 3 A Level Programme', subject:'A Levels', level:3, campus:'Lincoln Campus',
    url:'https://www.lincolncollege.ac.uk/course/level-3-a-level-programme-full-time', checked,
    summary:'Choose three A Level subjects. Individual subjects can have additional grade criteria.',
    rule:{ minTotal:{count:5, grade:4}, subjects:[{subject:'Mathematics',grade:4},{subject:'English Language',grade:4}] },
    warnings:['Individual A Level subjects have their own specific entry criteria and must be checked before advising.'], keywords:['university','academic','a levels']
  },
  {
    id:'business-l3', title:'Level 3 Business', subject:'Business', level:3, campus:'Lincoln Campus',
    url:'https://www.lincolncollege.ac.uk/course/level-3-business', checked,
    summary:'Foundation Diploma route covering business, marketing, finance and events.',
    rule:{ minTotal:{count:5,grade:4}, subjects:[{subject:'English Language',grade:4},{subject:'Mathematics',grade:4}] },
    warnings:['The official course page currently describes this course as significantly oversubscribed.'], keywords:['business','marketing','finance','management','events']
  },
  {
    id:'computing-l3', title:'Level 3 Computing and Information Technology', subject:'Computing', level:3, campus:'Lincoln Campus',
    url:'https://www.lincolncollege.ac.uk/course/level-3-computing-and-information-technology', checked,
    summary:'Computing, programming, databases, website development and cyber security.',
    rule:{ minTotal:{count:5,grade:4}, subjects:[{subject:'Mathematics',grade:5},{subject:'English Language',grade:4}] },
    warnings:['Interview/reference and evidence of previous IT knowledge/skills are also required.','The official course page currently describes this course as significantly oversubscribed.'], keywords:['software','coding','cyber','programming','IT','web']
  },
  {
    id:'applied-cyber-l3', title:'Applied Computing and Cyber Security Level 3', subject:'Computing', level:3, campus:'Lincoln Campus',
    url:'https://www.lincolncollege.ac.uk/course/applied-computing-and-cyber-security-level-3', checked,
    summary:'Programming, UX/UI, systems, networks and cyber security.',
    rule:{ minTotal:{count:5,grade:4}, subjects:[{subject:'Mathematics',grade:4},{subject:'English Language',grade:4}] },
    warnings:['A reference is also required.'], keywords:['cyber security','programming','ux','systems','networks']
  },
  {
    id:'electronic-computing-l3', title:'Electronic Engineering and Applied Computing Level 3', subject:'Computing', level:3, campus:'Lincoln / engineering pathway',
    url:'https://www.lincolncollege.ac.uk/course/electronic-engineering-and-applied-computing-level-3', checked,
    summary:'Electronic engineering combined with programming, web, cyber and digital infrastructure.',
    rule:{ minTotal:{count:5,grade:4}, subjects:[{subject:'Mathematics',grade:5},{subject:'English Language',grade:4}] },
    warnings:['A reference is also required.'], interests:['Engineering'], keywords:['electronics','engineering','cyber','computing','programming']
  },
  {
    id:'computing-electronics-l2', title:'Level 2 Computing & Electronics Technician', subject:'Computing', level:2, campus:'Lincoln / engineering pathway',
    url:'https://www.lincolncollege.ac.uk/course/level-2-computing-electronics-technician', checked,
    summary:'IT systems, websites, security, electronics fundamentals and technician maths.',
    rule:{ minTotal:{count:4,grade:3} },
    warnings:['Grade 4 in English or Maths is described as an advantage rather than a mandatory criterion; interview and reference are also required.'], keywords:['computing','electronics','technician','IT','web']
  },
  {
    id:'mechanical-engineering-l3', title:'Level 3 Mechanical Engineering', subject:'Engineering', level:3, campus:'Lincoln Campus',
    url:'https://www.lincolncollege.ac.uk/course/level-3-mechanical-engineering', checked,
    summary:'Mechanical engineering theory, practical workshop activity and projects.',
    rule:{ minTotal:{count:5,grade:4}, subjects:[{subject:'English Language',grade:4},{subject:'Mathematics',grade:4}], anySubjects:[{subjects:['Combined Science','Physics','Chemistry','Biology'],grade:4}] },
    warnings:['A Level 2 Mechanical Engineering Merit route is also published; this prototype only evaluates the GCSE route.'], keywords:['engineering','mechanical','manufacturing','workshop']
  },
  {
    id:'asi-space-engineering-l2', title:'Level 2 ASI Space & Engineering Studies', subject:'Air & Space Institute (ASI)', level:2, campus:'Air & Space Institute',
    url:'https://www.lincolncollege.ac.uk/course/level-2-asi-space-engineering-studies', checked,
    summary:'Engineering study with a space and aviation context.',
    rule:{ minTotal:{count:4,grade:1}, anySubjects:[{subjects:['English Language','Mathematics'],grade:4}] },
    warnings:['The official wording requires four GCSEs and grade 4+ in English Language and/or Maths; a science subject is preferable for progression. Welcome Day/practical/interview and a reference are also required.'], interests:['Engineering'], keywords:['aviation','space','engineering','aircraft']
  },
  {
    id:'automotive-entry3', title:'Introduction to Automotive Engineering Level Entry 3', subject:'Automotive Engineering', level:0, campus:'Lincoln College',
    url:'https://www.lincolncollege.ac.uk/course/introduction-to-automotive-engineering-level-entry-3', checked,
    summary:'Introduction to vehicle systems and maintenance for learners working below GCSE grade 3 in English/Maths.',
    rule:{ manualOnly:true },
    warnings:['Published entry wording is based on English Language and Maths at grade 2 or below or Functional Skills; this needs adviser judgement rather than simple high-grade matching.'], keywords:['cars','vehicles','mechanic','automotive']
  },
  {
    id:'plumbing-l1', title:'Level 1 Plumbing', subject:'Construction', level:1, campus:'Lincoln College',
    url:'https://www.lincolncollege.ac.uk/course/level-1-plumbing', checked,
    summary:'Practical plumbing fundamentals, safe working and domestic pipework.',
    rule:{ subjects:[{subject:'Mathematics',grade:3},{subject:'English Language',grade:3}] },
    keywords:['plumbing','construction','trade','pipes']
  },
  {
    id:'health-care-l1', title:'Level 1 Health and Social Care', subject:'Health and Social Care', level:1, campus:'Lincoln Campus',
    url:'https://www.lincolncollege.ac.uk/course/level-1-health-and-social-care', checked,
    summary:'Foundation route into health and social care with communication and professional skills.',
    rule:{ minTotal:{count:4,grade:2}, subjects:[{subject:'Mathematics',grade:2},{subject:'English Language',grade:2}] },
    warnings:['Two good references are also required.'], keywords:['care','health','support','social care']
  },
  {
    id:'health-care-l2', title:'Level 2 Health and Social Care', subject:'Health and Social Care', level:2, campus:'Lincoln Campus',
    url:'https://www.lincolncollege.ac.uk/course/level-2-health-and-social-care', checked,
    summary:'Industry-led care programme with placement experience.',
    rule:{ minTotal:{count:3,grade:3}, subjects:[{subject:'Mathematics',grade:3},{subject:'English Language',grade:3}] },
    warnings:['Two good references and an enhanced DBS check for placements are also required.'], keywords:['care','health','support','social care','nursing']
  },
  {
    id:'health-care-l3', title:'Level 3 Health & Social Care', subject:'Health and Social Care', level:3, campus:'Lincoln Campus',
    url:'https://www.lincolncollege.ac.uk/course/level-3-health-social-care', checked,
    summary:'Level 3 route with substantial industry placement.',
    rule:{ minTotal:{count:5,grade:4}, subjects:[{subject:'Mathematics',grade:4},{subject:'English Language',grade:5}] },
    warnings:['Two good references and an enhanced DBS check for placements are also required.'], keywords:['care','health','nursing','social care','midwifery']
  },
  {
    id:'skills-health-care', title:'Skills for Health and Social Care', subject:'Health and Social Care', level:0, campus:'Lincoln Campus',
    url:'https://www.lincolncollege.ac.uk/course/skills-for-health-and-social-care', checked,
    summary:'Entry Level to Level 1 supported route for confidence, independence and employability.',
    rule:{ noFormalGrades:true },
    warnings:['Welcome Day, taster/interview and BKSB/support-needs assessment still apply.'], keywords:['supported','care','health','childcare','employability']
  },
  {
    id:'sport-active-l2', title:'Level 2 Sport and Active Leisure Industry', subject:'Sport', level:2, campus:'Lincoln Campus',
    url:'https://www.lincolncollege.ac.uk/course/level-2-sport-and-active-leisure-industry', checked,
    summary:'Sports coaching, therapy, fitness, events and employability.',
    rule:{ minTotal:{count:3,grade:3} },
    keywords:['sport','fitness','coaching','therapy','personal trainer']
  },
  {
    id:'sport-exercise-l3', title:'Level 3 Sport and Exercise Science (2 A-levels)', subject:'Sport', level:3, campus:'Lincoln Campus',
    url:'https://www.lincolncollege.ac.uk/course/level-3-sport-and-exercise-science-2-a-levels', checked,
    summary:'Anatomy, psychology, fitness testing, coaching and research methods.',
    rule:{ minTotal:{count:5,grade:4}, subjects:[{subject:'English Language',grade:4},{subject:'Mathematics',grade:4}], anySubjects:[{subjects:['Combined Science','Physics','Chemistry','Biology'],grade:4}] },
    warnings:['Relevant A-Level-specific entry criteria also need to be met.'], keywords:['sport','physiotherapy','exercise','science','coaching']
  },
  {
    id:'art-design-l2', title:'Level 2 Diploma in Art and Design UAL', subject:'Creative Arts', level:2, campus:"Christ's Hospital Terrace",
    url:'https://www.lincolncollege.ac.uk/course/level-2-diploma-in-art-and-design-ual', checked,
    summary:'Broad art and design foundation with drawing, illustration, 3D, textiles, print, fashion and media.',
    rule:{ minTotal:{count:3,grade:3}, anySubjects:[{subjects:['Art & Design'],grade:3}] },
    warnings:['Portfolio/interview, a reference and a short written statement are also required. The published rule specifically expects an Art or Design related GCSE, so an adviser should confirm subject equivalence.'], keywords:['art','design','illustration','fashion','creative']
  },
  {
    id:'photography-l2', title:'Level 2 Diploma in Photography UAL', subject:'Creative Arts', level:2, campus:"Christ's Hospital Terrace",
    url:'https://www.lincolncollege.ac.uk/course/level-2-diploma-in-photography-ual', checked,
    summary:'Photography, darkroom and digital imaging with portfolio development.',
    rule:{ minTotal:{count:3,grade:3}, anySubjects:[{subjects:['Art & Design'],grade:3}] },
    warnings:['Portfolio/interview, reference and written statement are also required; adviser confirmation of an Art/Design-related GCSE is needed.'], keywords:['photography','camera','creative','art','media']
  },
  {
    id:'education-childcare-foundation-l2', title:'Level 2 T Level Foundation Year - Education and Childcare', subject:'Childcare', level:2, campus:'Lincoln Campus',
    url:'https://www.lincolncollege.ac.uk/course/level-2-t-level-foundation-year-education-and-childcare', checked,
    summary:'Foundation year intended to prepare learners for the Education and Childcare T Level.',
    rule:{ minTotal:{count:4,grade:3}, subjects:[{subject:'English Language',grade:3},{subject:'Mathematics',grade:3}], anySubjects:[{subjects:['English Language','Mathematics'],grade:4}] },
    warnings:['Published criteria require one of English/Maths at grade 4 and the other at grade 3, plus three grade-3 GCSEs. References, interview/written assessment and enhanced DBS requirements also apply.'], keywords:['childcare','education','early years','teaching']
  },
  {
    id:'professional-food-l1', title:'Level 1 Professional Food and Beverage', subject:'Catering', level:1, campus:'Lincoln College',
    url:'https://www.lincolncollege.ac.uk/course/level-1-professional-food-and-beverage', checked,
    summary:'Practical hospitality and catering entry route.',
    rule:{ minTotal:{count:4,grade:3}, subjects:[{subject:'English Language',grade:3},{subject:'Mathematics',grade:3}] },
    warnings:['Interest/motivation, ability to cope in a professional kitchen environment, taster activity and potentially a reference are also considered.'], keywords:['catering','hospitality','food','restaurant','chef']
  },
  {
    id:'events-l3', title:'Events Management - Level 3 route', subject:'Events Management', level:3, campus:'Lincoln College',
    url:'https://www.lincolncollege.ac.uk/school-leavers/how-to-apply/welcome-days', checked,
    summary:'Events pathway; the College Welcome Day guidance publishes the current headline GCSE entry criterion.',
    rule:{ minTotal:{count:4,grade:4} },
    warnings:['The published Welcome Day guidance says four GCSEs preferably including English Language and Maths at grade 4, or Merit at Level 2 in a related subject, plus interview. Verify against the current specific course page before an admissions decision.'], keywords:['events','event management','planning','hospitality']
  }
];

export const SUBJECT_LINKS = Object.fromEntries(SUBJECTS.map(subject => {
  const slugs = {
    'A Levels':'https://www.lincolncollege.ac.uk/school-leavers/a-levels',
    'Air & Space Institute (ASI)':'https://asi-newark.co.uk/',
    'Performing Arts & Dance':'https://www.lincolncollege.ac.uk/school-leavers/course-subjects/performing-arts-and-dance',
    'Policing College':'https://www.lincolncollege.ac.uk/school-leavers/course-subjects/policing-college',
    'Supported Education':'https://www.lincolncollege.ac.uk/school-leavers/supported-education',
    'T Levels':'https://www.lincolncollege.ac.uk/school-leavers/t-levels',
    'Uniformed Public Services':'https://www.lincolncollege.ac.uk/school-leavers/course-subjects/uniformed-protective-services'
  };
  const slug = subject.toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  return [subject, slugs[subject] || `https://www.lincolncollege.ac.uk/school-leavers/course-subjects/${slug}`];
}));
