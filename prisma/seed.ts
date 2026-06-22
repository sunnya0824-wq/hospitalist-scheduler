import { seedDatabase } from "../src/lib/seed";
import { prisma } from "../src/lib/prisma";

async function main() {
  const count = await seedDatabase();
  console.log(`Seeded ${count} physicians.`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
