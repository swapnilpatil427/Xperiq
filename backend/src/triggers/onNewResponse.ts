// eslint-disable-next-line @typescript-eslint/no-require-imports
const functions = require('firebase-functions/v2');
import { db } from '../lib/admin';
import { analyzeInsights } from '../lib/openrouter';

exports.onNewResponse = functions.firestore.onDocumentCreated(
  'orgs/{orgId}/surveys/{surveyId}/responses/{responseId}',
  async (event: { params: { orgId: string; surveyId: string; responseId: string } }) => {
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

    const responses = snap.docs.map((d: { data: () => unknown }) => d.data());

    try {
      const insights = await analyzeInsights((surveyDoc.data() as { title: string }).title, responses);
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
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('Auto-insights failed:', error.message);
    }
  }
);
