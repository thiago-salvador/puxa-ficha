const major = Number.parseInt(process.versions.node.split(".")[0] ?? "", 10)

if (major !== 24) {
  console.error(
    `[runtime] Node 24 obrigatório; atual ${process.versions.node}. Rode \`nvm use\` antes dos comandos do projeto.`,
  )
  process.exit(1)
}
