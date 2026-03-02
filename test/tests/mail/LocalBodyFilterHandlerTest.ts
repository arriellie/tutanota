import o from "@tutao/otest"
import { downcast } from "@tutao/tutanota-utils"
import { matchers, object, verify, when } from "testdouble"
import { Mode } from "../../../src/common/api/common/Env"
import { ClientClassifierType } from "../../../src/common/api/common/ClientClassifierType"
import { MailSetKind } from "../../../src/common/api/common/TutanotaConstants"
import { BodyTypeRef, MailDetailsTypeRef, MailSetTypeRef, MailTypeRef } from "../../../src/common/api/entities/tutanota/TypeRefs"
import { MailFacade } from "../../../src/common/api/worker/facades/lazy/MailFacade"
import type { MailboxDetail } from "../../../src/common/mailFunctionality/MailboxModel"
import { DeviceConfig } from "../../../src/common/misc/DeviceConfig"
import { LocalBodyFilterHandler } from "../../../src/mail-app/mail/model/LocalBodyFilterHandler"
import { MailModel } from "../../../src/mail-app/mail/model/MailModel"
import { createTestEntity } from "../TestUtils"

const { anything } = matchers

async function runWithDesktopEnv<T>(action: () => Promise<T>): Promise<T> {
	const previousMode = env.mode
	env.mode = Mode.Desktop
	try {
		return await action()
	} finally {
		env.mode = previousMode
	}
}

o.spec("LocalBodyFilterHandler", function () {
	let mailFacade: MailFacade
	let mailModel: MailModel
	let deviceConfig: DeviceConfig
	let localStorageMock: Storage
	let handler: LocalBodyFilterHandler

	const inboxFolder = createTestEntity(MailSetTypeRef, { _id: ["mailFolderList", "inbox"], folderType: MailSetKind.INBOX })
	const targetFolder = createTestEntity(MailSetTypeRef, { _id: ["mailFolderList", "target"], folderType: MailSetKind.ARCHIVE })
	const otherFolder = createTestEntity(MailSetTypeRef, { _id: ["mailFolderList", "other"], folderType: MailSetKind.TRASH })
	const mailboxDetail = downcast<MailboxDetail>({
		mailbox: {
			mailSets: {
				_id: "mailFolderList",
			},
		},
	})

	o.beforeEach(function () {
		mailFacade = object<MailFacade>()
		mailModel = object<MailModel>()
		localStorageMock = object<Storage>()
		when(localStorageMock.getItem(DeviceConfig.LocalStorageKey)).thenReturn(null)
		deviceConfig = new DeviceConfig(localStorageMock)
		handler = new LocalBodyFilterHandler(mailFacade, mailModel, deviceConfig)
		when(mailModel.getMailboxFoldersForId("mailFolderList")).thenResolve(
			downcast({
				getFolderById: (id: Id) => {
					if (id === "target") {
						return targetFolder
					}
					if (id === "other") {
						return otherFolder
					}
					return null
				},
			}),
		)
	})

	o("matches HTML bodies case-insensitively and creates processInbox data", async function () {
		const body = createTestEntity(BodyTypeRef, { text: "<p>Your INVOICE is ready</p>" })
		const mailDetails = createTestEntity(MailDetailsTypeRef, { _id: "mailDetail", body })
		const mail = createTestEntity(MailTypeRef, {
			_id: ["listId", "elementId"],
			_ownerGroup: "owner",
			mailDetails: ["detailsList", "mailDetail"],
		})
		deviceConfig.setLocalBodyFilters("owner", [{ id: "rule-1", needle: "invoice", targetFolder: targetFolder._id, enabled: true }])
		when(mailFacade.loadMailDetailsBlob(mail)).thenResolve(mailDetails)
		when(mailFacade.createModelInputAndUploadableVectors(mail, mailDetails, inboxFolder)).thenResolve({
			modelInput: [],
			uploadableVectorLegacy: new Uint8Array([1]),
			uploadableVector: new Uint8Array([2]),
		})

		const result = await runWithDesktopEnv(() => handler.findAndApplyMatchingLocalBodyFilter(mailboxDetail, mail, inboxFolder))

		o(result?.targetFolder).deepEquals(targetFolder)
		o(result?.processInboxDatum).deepEquals({
			mailId: mail._id,
			targetMoveFolder: targetFolder._id,
			classifierType: ClientClassifierType.CUSTOMER_INBOX_RULES,
			vectorLegacy: new Uint8Array([1]),
			vectorWithServerClassifiers: new Uint8Array([2]),
			ownerEncMailSessionKeys: [],
		})
	})

	o("skips disabled rules", async function () {
		const body = createTestEntity(BodyTypeRef, { text: "<p>Your invoice is ready</p>" })
		const mailDetails = createTestEntity(MailDetailsTypeRef, { _id: "mailDetail", body })
		const mail = createTestEntity(MailTypeRef, {
			_id: ["listId", "elementId"],
			_ownerGroup: "owner",
			mailDetails: ["detailsList", "mailDetail"],
		})
		deviceConfig.setLocalBodyFilters("owner", [{ id: "rule-1", needle: "invoice", targetFolder: targetFolder._id, enabled: false }])
		when(mailFacade.loadMailDetailsBlob(mail)).thenResolve(mailDetails)

		const result = await runWithDesktopEnv(() => handler.findMatchingLocalBodyFilterTarget(mailboxDetail, mail, inboxFolder))

		o(result).equals(null)
		verify(mailFacade.loadMailDetailsBlob(anything()), { times: 0 })
	})

	o("uses the first matching rule with an existing target folder", async function () {
		const body = createTestEntity(BodyTypeRef, { text: "<p>Your invoice is ready</p>" })
		const mailDetails = createTestEntity(MailDetailsTypeRef, { _id: "mailDetail", body })
		const mail = createTestEntity(MailTypeRef, {
			_id: ["listId", "elementId"],
			_ownerGroup: "owner",
			mailDetails: ["detailsList", "mailDetail"],
		})
		deviceConfig.setLocalBodyFilters("owner", [
			{ id: "rule-1", needle: "invoice", targetFolder: ["mailFolderList", "missing"], enabled: true },
			{ id: "rule-2", needle: "invoice", targetFolder: otherFolder._id, enabled: true },
			{ id: "rule-3", needle: "invoice", targetFolder: targetFolder._id, enabled: true },
		])
		when(mailFacade.loadMailDetailsBlob(mail)).thenResolve(mailDetails)

		const result = await runWithDesktopEnv(() => handler.findMatchingLocalBodyFilterTarget(mailboxDetail, mail, inboxFolder))

		o(result).deepEquals(otherFolder)
	})

	o("does not run outside inbox", async function () {
		const nonInboxFolder = createTestEntity(MailSetTypeRef, { _id: ["mailFolderList", "spam"], folderType: MailSetKind.SPAM })
		const mail = createTestEntity(MailTypeRef, {
			_id: ["listId", "elementId"],
			_ownerGroup: "owner",
		})
		deviceConfig.setLocalBodyFilters("owner", [{ id: "rule-1", needle: "invoice", targetFolder: targetFolder._id, enabled: true }])

		const result = await runWithDesktopEnv(() => handler.findMatchingLocalBodyFilterTarget(mailboxDetail, mail, nonInboxFolder))

		o(result).equals(null)
		verify(mailFacade.loadMailDetailsBlob(anything()), { times: 0 })
	})
})
