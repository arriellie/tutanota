import { Nullable } from "@tutao/tutanota-utils"
import { assertMainOrNode, isDesktop } from "../../../common/api/common/Env"
import { ClientClassifierType } from "../../../common/api/common/ClientClassifierType"
import { getMailBodyText } from "../../../common/api/common/CommonMailUtils.js"
import { elementIdPart } from "../../../common/api/common/utils/EntityUtils.js"
import { MailSetKind } from "../../../common/api/common/TutanotaConstants"
import { Mail, MailDetails, MailSet } from "../../../common/api/entities/tutanota/TypeRefs.js"
import { htmlToText } from "../../../common/api/common/utils/IndexUtils.js"
import { MailFacade } from "../../../common/api/worker/facades/lazy/MailFacade.js"
import type { MailboxDetail } from "../../../common/mailFunctionality/MailboxModel.js"
import type { DeviceConfig } from "../../../common/misc/DeviceConfig.js"
import { MailModel } from "./MailModel"
import type { UnencryptedProcessInboxDatum } from "./ProcessInboxHandler"

assertMainOrNode()

export class LocalBodyFilterHandler {
	constructor(
		private readonly mailFacade: MailFacade,
		private readonly mailModel: MailModel,
		private readonly deviceConfig: DeviceConfig,
	) {}

	async findAndApplyMatchingLocalBodyFilter(
		mailboxDetail: MailboxDetail,
		mail: Readonly<Mail>,
		sourceFolder: MailSet,
	): Promise<Nullable<{ targetFolder: MailSet; processInboxDatum: UnencryptedProcessInboxDatum }>> {
		const result = await this.findMatchingLocalBodyFilter(mailboxDetail, mail, sourceFolder)
		if (result == null) {
			return null
		}

		const { targetFolder, mailDetails } = result
		const { uploadableVectorLegacy, uploadableVector } = await this.mailFacade.createModelInputAndUploadableVectors(mail, mailDetails, sourceFolder)
		const processInboxDatum: UnencryptedProcessInboxDatum = {
			mailId: mail._id,
			targetMoveFolder: targetFolder._id,
			classifierType: ClientClassifierType.CUSTOMER_INBOX_RULES,
			vectorLegacy: uploadableVectorLegacy,
			vectorWithServerClassifiers: uploadableVector,
			ownerEncMailSessionKeys: [],
		}

		return { targetFolder, processInboxDatum }
	}

	async findMatchingLocalBodyFilterTarget(mailboxDetail: MailboxDetail, mail: Readonly<Mail>, sourceFolder: MailSet): Promise<MailSet | null> {
		const result = await this.findMatchingLocalBodyFilter(mailboxDetail, mail, sourceFolder)
		return result?.targetFolder ?? null
	}

	private async findMatchingLocalBodyFilter(
		mailboxDetail: MailboxDetail,
		mail: Readonly<Mail>,
		sourceFolder: MailSet,
	): Promise<Nullable<{ targetFolder: MailSet; mailDetails: MailDetails }>> {
		if (!isDesktop() || sourceFolder.folderType !== MailSetKind.INBOX || mail._errors || mail._ownerGroup == null) {
			return null
		}

		const rules = this.deviceConfig.getLocalBodyFilters(mail._ownerGroup).filter((rule) => rule.enabled)
		if (rules.length === 0) {
			return null
		}

		try {
			const mailDetails = await this.mailFacade.loadMailDetailsBlob(mail)
			const normalizedBody = htmlToText(getMailBodyText(mailDetails.body)).toLowerCase()
			const folders = await this.mailModel.getMailboxFoldersForId(mailboxDetail.mailbox.mailSets._id)

			for (const rule of rules) {
				if (!normalizedBody.includes(rule.needle)) {
					continue
				}

				const targetFolder = folders.getFolderById(elementIdPart(rule.targetFolder))
				if (targetFolder != null) {
					return { targetFolder, mailDetails }
				}
			}
		} catch (e) {
			console.error("Error processing local body filter:", e)
		}

		return null
	}
}
