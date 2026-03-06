import o from "@tutao/otest"
import { matchers, object, verify, when } from "testdouble"
import { overrideUserDataPath, UserDataPathApp, UserDataPathFs } from "../../../src/common/desktop/UserDataPath"

o.spec("UserDataPath", () => {
	let app: UserDataPathApp
	let fs: UserDataPathFs

	o.beforeEach(() => {
		app = object()
		fs = object()
		when(app.getAppPath()).thenReturn("/app")
		when(app.getPath("appData")).thenReturn("/app-data")
	})

	o.test("creates the overridden userData directory when package.json has a name", () => {
		when(fs.readFileSync("/app/package.json", "utf8")).thenReturn(JSON.stringify({ name: "ellie-mail-debug" }))

		overrideUserDataPath(app, fs)

		verify(app.setPath("userData", "/app-data/ellie-mail-debug-settings"))
		verify(fs.mkdirSync("/app-data/ellie-mail-debug-settings", { recursive: true }))
	})

	o.test("does not override the path when package.json name is missing", () => {
		when(fs.readFileSync("/app/package.json", "utf8")).thenReturn(JSON.stringify({}))

		overrideUserDataPath(app, fs)

		verify(app.setPath(matchers.anything(), matchers.anything()), { times: 0 })
		verify(fs.mkdirSync(matchers.anything(), matchers.anything()), { times: 0 })
	})
})
