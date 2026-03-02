import o from "@tutao/otest"
import { assertNotNull, delay, downcast } from "@tutao/tutanota-utils"
import { object, when } from "testdouble"
import { MailSetKind } from "../../../src/common/api/common/TutanotaConstants"
import { FolderSystem } from "../../../src/common/api/common/mail/FolderSystem"
import { MailSetTypeRef } from "../../../src/common/api/entities/tutanota/TypeRefs"
import type { MailboxDetail } from "../../../src/common/mailFunctionality/MailboxModel"
import type { LocalBodyFilterRule } from "../../../src/common/misc/DeviceConfig"
import type { ActionDialogProps } from "../../../src/common/gui/base/Dialog"
import { Dialog } from "../../../src/common/gui/base/Dialog"
import { MailModel } from "../../../src/mail-app/mail/model/MailModel"
import { mailLocator } from "../../../src/mail-app/mailLocator"
import * as AddLocalBodyFilterDialog from "../../../src/mail-app/settings/AddLocalBodyFilterDialog"
import { createTestEntity } from "../TestUtils"

o.spec("AddLocalBodyFilterDialog", function () {
	const mutableMailLocator = mailLocator as unknown as { mailModel: MailModel }
	let originalShowActionDialog: typeof Dialog.showActionDialog
	let originalMailModel: MailModel
	let mailModel: MailModel
	let capturedDialogProps: ActionDialogProps | null
	let dialogClosed: boolean

	const archiveFolder = createTestEntity(MailSetTypeRef, {
		_id: ["mailFolderList", "archive"],
		folderType: MailSetKind.ARCHIVE,
	})
	const targetFolder = createTestEntity(MailSetTypeRef, {
		_id: ["mailFolderList", "target"],
		folderType: MailSetKind.CUSTOM,
		name: "Bills",
		parentFolder: archiveFolder._id,
	})
	const mailboxDetail = downcast<MailboxDetail>({
		mailbox: {
			mailSets: {
				_id: "mailFolderList",
			},
		},
		mailGroup: {
			_id: "mailGroup",
		},
	})
	const folderSystem = downcast<FolderSystem>({
		getIndentedList: () => [
			{ level: 0, folder: archiveFolder },
			{ level: 1, folder: targetFolder },
		],
		getSystemFolderByType: (type: MailSetKind) => (type === MailSetKind.ARCHIVE ? archiveFolder : null),
		getFolderById: (id: Id) => {
			if (id === "archive") {
				return archiveFolder
			}
			if (id === "target") {
				return targetFolder
			}
			return null
		},
		getPathToFolder: (folderId: IdTuple) => (folderId[1] === "target" ? [archiveFolder, targetFolder] : [archiveFolder]),
	})

	o.beforeEach(function () {
		originalShowActionDialog = Dialog.showActionDialog
		originalMailModel = mutableMailLocator.mailModel
		mailModel = object<MailModel>()
		capturedDialogProps = null
		dialogClosed = false

		mutableMailLocator.mailModel = mailModel
		when(mailModel.getMailboxFoldersForId("mailFolderList")).thenResolve(folderSystem)

		Dialog.showActionDialog = ((props: ActionDialogProps) => {
			capturedDialogProps = props
			return downcast<Dialog>({
				close: () => {
					dialogClosed = true
				},
			})
		}) as typeof Dialog.showActionDialog
	})

	o.afterEach(function () {
		Dialog.showActionDialog = originalShowActionDialog
		mutableMailLocator.mailModel = originalMailModel
	})

	o("normalizes new rules before resolving", async function () {
		const promise = AddLocalBodyFilterDialog.show(mailboxDetail, [])
		await delay(0)
		const dialogProps = assertNotNull(capturedDialogProps)
		const children = getDialogChildren(dialogProps)

		children[0].attrs.oninput("  Invoice  ")
		children[1].attrs.selectionChangedHandler(targetFolder)
		getCheckboxVnode(children[2]).attrs.onChecked(false)

		o(dialogProps.validator?.()).equals(null)
		assertNotNull(dialogProps.okAction)(downcast<Dialog>({ close: () => (dialogClosed = true) }))

		const result = assertNotNull(await promise)
		o(result.needle).equals("invoice")
		o(result.targetFolder).deepEquals(targetFolder._id)
		o(result.enabled).equals(false)
		o(result.id.length > 0).equals(true)
		o(dialogClosed).equals(true)
	})

	o("rejects duplicate normalized rules", async function () {
		const existingRules: LocalBodyFilterRule[] = [{ id: "existing", needle: "invoice", targetFolder: targetFolder._id, enabled: true }]
		const promise = AddLocalBodyFilterDialog.show(mailboxDetail, existingRules)
		await delay(0)
		const dialogProps = assertNotNull(capturedDialogProps)
		const children = getDialogChildren(dialogProps)

		children[0].attrs.oninput(" Invoice ")
		children[1].attrs.selectionChangedHandler(targetFolder)

		o(dialogProps.validator?.()).equals("inboxRuleAlreadyExists_msg")
		dialogProps.cancelAction?.(downcast<Dialog>({}))

		o(await promise).equals(null)
	})

	o("preserves the edited rule id", async function () {
		const promise = AddLocalBodyFilterDialog.show(mailboxDetail, [], {
			id: "rule-1",
			needle: "invoice",
			targetFolder: archiveFolder._id,
			enabled: true,
		})
		await delay(0)
		const dialogProps = assertNotNull(capturedDialogProps)
		const children = getDialogChildren(dialogProps)

		children[0].attrs.oninput(" Receipts ")
		assertNotNull(dialogProps.okAction)(downcast<Dialog>({ close: () => (dialogClosed = true) }))

		const result = assertNotNull(await promise)
		o(result.id).equals("rule-1")
		o(result.needle).equals("receipts")
		o(result.enabled).equals(true)
	})
})

function getDialogChildren(dialogProps: ActionDialogProps): any[] {
	return assertNotNull((dialogProps.child as () => any[])())
}

function getCheckboxVnode(wrapperVnode: any): any {
	return Array.isArray(wrapperVnode.children) ? wrapperVnode.children[0] : wrapperVnode.children
}
