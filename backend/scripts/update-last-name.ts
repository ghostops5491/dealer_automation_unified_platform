import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Update last_name to be non-required
  const result = await prisma.screenField.updateMany({
    where: { name: 'last_name' },
    data: { isRequired: false }
  });
  console.log('Updated', result.count, 'last_name fields to be non-required');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

