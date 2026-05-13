const functions = require('firebase-functions/v2');
const { db } = require('../lib/admin');
const { analyzeInsights } = require('../lib/openrouter');

exports.onNewResponse = functions.firestore.onDocumentCreated(
  'orgs/{orgId}/surveys/{surveyId}/responses/{responseId}',
  async (event) => {
    const { orgId, surveyId } = event.params;

    const countSnap = await db
      .collection('orgs').doc(orgId)
      .collection('surveys').doc(surveyId)
      .collection('responses')
      .count()
      .get();
    const count = countSnap.data().count;

    const thresholds = [10, 50, 100, 500];
    if (!thresholds.includes(count)) return;

    const surveyDoc = await db
      .collection('orgs').doc(orgId)
      .collection('surveys').doc(surveyId)
      .get();
    if (!surveyDoc.exists) return;

    const snap = await db
      .collection('orgs').doc(orgId)
      .collection('surveys').doc(surveyId)
      .collection('responses')
      .orderBy('submittedAt', 'desc')
      .limit(200)
      .get();

    const responses = snap.docs.map((d) => d.data());

    try {
      const insights = await analyzeInsights(surveyDoc.data().title, responses);
      await db
        .collection('orgs').doc(orgId)
        .collection('surveys').doc(surveyId)
        .collection('insights')
        .add({
          ...insights,
          surveyId,
          responseCount: count,
          generatedAt: new Date(),
          triggeredBy: 'auto',
        });
      console.log(`Auto-generated insights for survey ${surveyId} at ${count} responses`);
    } catch (err) {
      console.error('Auto-insights failed:', err.message);
    }
  }
);
