import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Create default workspace
  const workspace = await prisma.workspace.upsert({
    where: { slug: 'default' },
    update: {},
    create: {
      name: 'Default Workspace',
      slug: 'default',
    },
  })
  console.log(`Workspace: ${workspace.id} (${workspace.name})`)

  // Create default user
  const user = await prisma.user.upsert({
    where: { email: 'admin@localhost' },
    update: {},
    create: {
      email: 'admin@localhost',
      displayName: 'Local Admin',
      role: 'admin',
    },
  })
  console.log(`User: ${user.id} (${user.displayName})`)

  // Link user to workspace
  await prisma.workspaceUser.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: user.id,
      },
    },
    update: {},
    create: {
      workspaceId: workspace.id,
      userId: user.id,
      role: 'admin',
    },
  })
  console.log('User linked to workspace')

  // Create default executor config if none exists
  const existingExecutor = await prisma.executorConfig.findFirst({
    where: { isDefault: true },
  })
  if (!existingExecutor) {
    await prisma.executorConfig.create({
      data: {
        name: 'default-claude-cli',
        type: 'claude-cli',
        isDefault: true,
        configJson: JSON.stringify({
          model: 'claude-opus-4-6',
          maxTurns: 10,
        }),
      },
    })
    console.log('Default executor config created')
  }

  console.log('Seed complete')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
