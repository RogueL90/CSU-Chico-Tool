// Hardcoded intents for the CSU Chico chatbot.
// When AWS Bedrock is integrated, the scoring logic will call the API instead.

export const CONFIDENCE_THRESHOLD = 75;

export const INTENTS = [
  {
    id: 'financial_aid',
    label: 'Financial Aid',
    keywords: ['financial','aid','fafsa','money','scholarship','loan','grant','tuition','pay','cost','bill'],
    outputs: {
      text: 'The Financial Aid Office is in Kendall Hall, Room 200. Hours: Mon–Fri 8am–5pm. They handle FAFSA, scholarships, loans, and tuition questions.',
      phone: '5308986451',
      map: { label: 'Kendall Hall – Financial Aid', lat: 39.72848, lng: -121.84726 },
    },
    outputTypes: ['text', 'map', 'phone'],
  },
  {
    id: 'admissions',
    label: 'Admissions & Records',
    keywords: ['admit','admissions','apply','application','enroll','enrollment','register','registration','records','transcript','classes','schedule','add','drop'],
    outputs: {
      text: 'Admissions & Records is in Kendall Hall, Room 220. They handle enrollment, transcripts, and class registration. Hours: Mon–Fri 8am–5pm.',
      phone: '5308986116',
      map: { label: 'Kendall Hall – Admissions & Records', lat: 39.72848, lng: -121.84726 },
    },
    outputTypes: ['text', 'map', 'phone'],
  },
  {
    id: 'campus_police',
    label: 'Campus Police / Emergency',
    keywords: ['police','emergency','help','danger','unsafe','theft','lost','missing','crime','accident','hurt','injury','security','fire','assault'],
    outputs: {
      text: 'For life-threatening emergencies, call 911 immediately. For non-emergency campus safety matters, contact University Police.',
      phone: '5308986116',
      map: { label: 'University Police – CSUC', lat: 39.73012, lng: -121.84500 },
    },
    outputTypes: ['text', 'phone', 'map'],
  },
  {
    id: 'health_center',
    label: 'Student Health Center',
    keywords: ['health','sick','doctor','nurse','medical','clinic','ill','medicine','appointment','vaccine','covid','mental','counseling','therapy','wellbeing'],
    outputs: {
      text: 'The Student Health Center offers medical care and mental health services. Hours: Mon–Fri 8am–5pm. Appointments recommended.',
      phone: '5308986452',
      map: { label: 'Student Health Center – CSUC', lat: 39.72910, lng: -121.84650 },
    },
    outputTypes: ['text', 'map', 'phone'],
  },
  {
    id: 'library',
    label: 'Meriam Library',
    keywords: ['library','book','study','research','database','journal','printing','print','computer','wifi','internet','quiet','reading'],
    outputs: {
      text: 'Meriam Library is open Mon–Thu 7:30am–10pm, Fri 7:30am–6pm, Sat–Sun 10am–6pm. Offers study spaces, printing, and research databases.',
      map: { label: 'Meriam Library – CSUC', lat: 39.72970, lng: -121.84780 },
    },
    outputTypes: ['text', 'map'],
  },
  {
    id: 'dining',
    label: 'Dining & Food',
    keywords: ['food','eat','hungry','dining','cafe','cafeteria','restaurant','meal','lunch','breakfast','dinner','coffee','snack'],
    outputs: {
      text: 'CSUC has dining options in the Bell Memorial Union and across campus. Hours vary by location — check the campus dining website for current times.',
      map: { label: 'Bell Memorial Union – Dining', lat: 39.72900, lng: -121.84600 },
    },
    outputTypes: ['text', 'map'],
  },
  {
    id: 'parking',
    label: 'Parking & Transportation',
    keywords: ['park','parking','permit','lot','bus','transport','shuttle','car','tow','ticket','citation','violation'],
    outputs: {
      text: 'Parking permits are required Mon–Fri. Visitor pay stations are available. Contact Parking Services for permits, appeals, and transit passes.',
      phone: '5308986897',
      map: { label: 'Parking Services – CSUC', lat: 39.72750, lng: -121.84900 },
    },
    outputTypes: ['text', 'phone', 'map'],
  },
  {
    id: 'it_support',
    label: 'IT Help Desk',
    keywords: ['computer','it','tech','support','password','login','email','wifi','network','software','hardware','portal','canvas','account','reset'],
    outputs: {
      text: 'The IT Help Desk is in Meriam Library, Room 142. They assist with logins, Canvas, email, and campus technology.',
      phone: '5308987700',
    },
    outputTypes: ['text', 'phone'],
  },
];
