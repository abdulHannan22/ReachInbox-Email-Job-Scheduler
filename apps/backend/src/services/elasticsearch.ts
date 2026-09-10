import { Client } from "@elastic/elasticsearch";

const esClient = new Client({
  node: process.env.ELASTICSEARCH_NODE || "http://localhost:9200",
});

export const indexEmail = async (emailData: any) => {
  try {
    await esClient.index({
      index: "emails",
      id: emailData.id,
      document: {
        userId: emailData.userId,
        senderId: emailData.senderId,
        toEmail: emailData.toEmail,
        subject: emailData.subject,
        body: emailData.body,
        status: emailData.status,
        scheduledFor: emailData.scheduledFor,
        createdAt: new Date(),
      },
    });
  } catch (error) {
    console.error("Elasticsearch indexing error:", error);
  }
};

export const searchEmails = async (userId: string, query: string, status?: string) => {
  try {
    const must: any[] = [{ match: { userId } }];
    
    if (query) {
      must.push({
        multi_match: {
          query,
          fields: ["subject", "toEmail", "body"],
        },
      });
    }

    if (status) {
      must.push({ match: { status } });
    }

    const result = await esClient.search({
      index: "emails",
      query: {
        bool: {
          must,
        },
      },
      sort: [{ createdAt: { order: "desc" } }],
    });

    return result.hits.hits.map((hit) => hit._source);
  } catch (error) {
    console.error("Elasticsearch search error:", error);
    return [];
  }
};
