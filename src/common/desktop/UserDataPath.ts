import path from "node:path"

export type UserDataPathApp = {
	getAppPath(): string
	getPath(name: "appData" | "userData"): string
	setPath(name: "userData", value: string): void
}

export type UserDataPathFs = {
	readFileSync(path: string, encoding: BufferEncoding): string
	mkdirSync(path: string, options: { recursive: true }): void
}

export function overrideUserDataPath(app: UserDataPathApp, fs: UserDataPathFs): void {
	const packageJson = JSON.parse(fs.readFileSync(path.join(app.getAppPath(), "package.json"), "utf8"))
	if (typeof packageJson.name !== "string" || packageJson.name.length === 0) {
		return
	}

	const userDataPath = path.join(app.getPath("appData"), `${packageJson.name}-settings`)
	app.setPath("userData", userDataPath)
	fs.mkdirSync(userDataPath, { recursive: true })
}
