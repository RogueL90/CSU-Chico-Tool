/**
 * Hardcoded follow-up question tree.
 *
 * Each node:
 *   id         - unique identifier
 *   question   - text shown to the user
 *   choices    - array of { label, nextId, boostIntentIds }
 *     label          - button text
 *     nextId         - next question node id, or null if this is a leaf
 *     boostIntentIds - which intent ids get a confidence boost on selection
 */
export const QUESTION_TREE = [
  {
    id: 'root',
    question: 'What can I help you with today?',
    choices: [
      {
        label: 'Money, tuition, or financial aid',
        nextId: null,
        boostIntentIds: ['financial_aid'],
      },
      {
        label: 'Classes, enrollment, or records',
        nextId: null,
        boostIntentIds: ['admissions'],
      },
    ],
  },
  {
    id: 'campus_services',
    question: 'What kind of help do you need on campus?',
    choices: [
      {
        label: 'Food or study spots',
        nextId: 'food_or_study',
        boostIntentIds: ['dining', 'library'],
      },
      {
        label: 'Health, parking, or an emergency',
        nextId: 'safety_transport',
        boostIntentIds: ['parking', 'health_center', 'campus_police'],
      },
    ],
  },
  {
    id: 'food_or_study',
    question: 'Which one?',
    choices: [
      {
        label: 'I need food or coffee',
        nextId: null,
        boostIntentIds: ['dining'],
      },
      {
        label: 'I need a place to study or do research',
        nextId: null,
        boostIntentIds: ['library'],
      },
    ],
  },
  {
    id: 'safety_transport',
    question: 'Which one?',
    choices: [
      {
        label: 'Parking permit or transportation',
        nextId: null,
        boostIntentIds: ['parking'],
      },
      {
        label: 'Medical, counseling, or an emergency',
        nextId: null,
        boostIntentIds: ['health_center', 'campus_police'],
      },
    ],
  },
  {
    id: 'tech_or_other',
    question: 'Can you tell me more?',
    choices: [
      {
        label: 'Tech support, login, or Canvas',
        nextId: null,
        boostIntentIds: ['it_support'],
      },
      {
        label: 'Something else on campus',
        nextId: 'campus_services',
        boostIntentIds: [],
      },
    ],
  },
];

export function getQuestion(id) {
  return QUESTION_TREE.find((q) => q.id === id) ?? null;
}
