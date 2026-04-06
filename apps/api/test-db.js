const { PrismaClient } = require("./node_modules/@prisma/client");
async function main() {
  const prisma = new PrismaClient();
  const submission = await prisma.kYCSubmission.findUnique({ where: { id: '16171696-89ba-4bbd-95bf-63b6f2f0c26b' } });
  console.log("SUBMISSION:", submission);
  const clientUser = await prisma.clientUser.findUnique({ where: { id: submission.userId } });
  console.log("CLIENT USER:", clientUser);
  const client = await prisma.client.findUnique({ where: { id: submission.clientId } });
  console.log("CLIENT:", client);
  await prisma.$disconnect();
}
main();
