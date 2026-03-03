import { readFile, stat } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const packageJsonUrl = new URL("../package.json", import.meta.url)
const packageLockUrl = new URL("../package-lock.json", import.meta.url)
const nvmrcUrl = new URL("../.nvmrc", import.meta.url)
const resolvedDepsUrl = new URL("../node_modules/.npm-deps-resolved", import.meta.url)
const rolldownPackageUrl = new URL("../node_modules/rolldown/package.json", import.meta.url)

await main()

async function main() {
	const failures = []

	await checkNodeVersion(failures)
	await checkDependencyInstallFreshness(failures)
	await checkInstalledRolldownVersion(failures)

	if (failures.length === 0) {
		return
	}

	for (const failure of failures) {
		console.error(`Preflight failed: ${failure}`)
	}
	process.exit(1)
}

async function checkNodeVersion(failures) {
	const expectedVersion = (await readTextFile(nvmrcUrl)).trim()
	const actualVersion = process.versions.node

	if (actualVersion === expectedVersion) {
		return
	}

	failures.push(`expected Node ${expectedVersion} from .nvmrc but found ${actualVersion}. Switch to the repo version first (for example: \`fnm use\`).`)
}

async function checkDependencyInstallFreshness(failures) {
	let resolvedDepsStat
	try {
		resolvedDepsStat = await stat(fileURLToPath(resolvedDepsUrl))
	} catch {
		failures.push("dependencies are not installed or postinstall has not completed. Run `npm install`.")
		return
	}

	const manifests = [
		{ label: "package.json", url: packageJsonUrl },
		{ label: "package-lock.json", url: packageLockUrl },
	]

	const newerThanInstall = []
	for (const manifest of manifests) {
		const manifestStat = await stat(fileURLToPath(manifest.url))
		if (manifestStat.mtimeMs > resolvedDepsStat.mtimeMs) {
			newerThanInstall.push(manifest.label)
		}
	}

	if (newerThanInstall.length === 0) {
		return
	}

	failures.push(`${newerThanInstall.join(" and ")} changed after the last install. Refresh local dependencies with \`npm install\`.`)
}

async function checkInstalledRolldownVersion(failures) {
	const packageJson = await readJsonFile(packageJsonUrl)
	const expectedVersion = packageJson.devDependencies?.rolldown

	if (!expectedVersion) {
		return
	}

	let actualVersion
	try {
		const rolldownPackage = await readJsonFile(rolldownPackageUrl)
		actualVersion = rolldownPackage.version
	} catch {
		failures.push("rolldown is not installed. Run `npm install`.")
		return
	}

	if (actualVersion === expectedVersion) {
		return
	}

	failures.push(`installed rolldown ${actualVersion} does not match package.json (${expectedVersion}). Refresh local dependencies with \`npm install\`.`)
}

async function readJsonFile(url) {
	const file = await readFile(url, "utf8")
	return JSON.parse(file)
}

async function readTextFile(url) {
	return readFile(url, "utf8")
}
