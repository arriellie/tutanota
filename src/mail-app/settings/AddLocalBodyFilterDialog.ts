import { defer } from "@tutao/tutanota-utils"
import m from "mithril"
import stream from "mithril/stream"
import { assertMainOrNode } from "../../common/api/common/Env"
import { elementIdPart, isSameId } from "../../common/api/common/utils/EntityUtils"
import { MailSetKind } from "../../common/api/common/TutanotaConstants"
import { Dialog } from "../../common/gui/base/Dialog"
import { Checkbox } from "../../common/gui/base/Checkbox"
import { DropDownSelector } from "../../common/gui/base/DropDownSelector.js"
import { Autocapitalize, TextField } from "../../common/gui/base/TextField.js"
import type { MailboxDetail } from "../../common/mailFunctionality/MailboxModel.js"
import type { LocalBodyFilterRule } from "../../common/misc/DeviceConfig.js"
import { lang } from "../../common/misc/LanguageViewModel"
import type { TranslationKey } from "../../common/misc/LanguageViewModel"
import type { IndentedFolder } from "../../common/api/common/mail/FolderSystem.js"
import { mailLocator } from "../mailLocator.js"
import { assertSystemFolderOfType, getFolderName, getIndentedFolderNameForDropdown, getPathToFolderString } from "../mail/model/MailUtils.js"

assertMainOrNode()

export async function show(
	mailboxDetail: MailboxDetail,
	existingRules: readonly LocalBodyFilterRule[],
	ruleToEdit: LocalBodyFilterRule | null = null,
): Promise<LocalBodyFilterRule | null> {
	const result = defer<LocalBodyFilterRule | null>()
	const folders = await mailLocator.mailModel.getMailboxFoldersForId(mailboxDetail.mailbox.mailSets._id)
	const targetFolders = folders.getIndentedList().map((folderInfo: IndentedFolder) => ({
		name: getIndentedFolderNameForDropdown(folderInfo),
		value: folderInfo.folder,
	}))
	const initialRule: LocalBodyFilterRule = ruleToEdit ?? {
		id: createLocalBodyFilterId(),
		needle: "",
		targetFolder: assertSystemFolderOfType(folders, MailSetKind.ARCHIVE)._id,
		enabled: true,
	}
	const selectedFolder = folders.getFolderById(elementIdPart(initialRule.targetFolder))
	const needle = stream(initialRule.needle)
	const targetFolder = stream(selectedFolder ?? assertSystemFolderOfType(folders, MailSetKind.ARCHIVE))
	const enabled = stream(initialRule.enabled)

	Dialog.showActionDialog({
		title: lang.makeTranslation("localBodyFilterDialog_title", "Local body filter"),
		child: () => [
			m(TextField, {
				label: lang.makeTranslation("localBodyFilterWords_label", "Words"),
				autocapitalize: Autocapitalize.none,
				value: needle(),
				oninput: needle,
			}),
			m(DropDownSelector, {
				label: lang.makeTranslation("localBodyFilterTarget_label", "Target folder"),
				items: targetFolders,
				selectedValue: targetFolder(),
				selectedValueDisplay: getFolderName(targetFolder()),
				selectionChangedHandler: targetFolder,
				helpLabel: () => getPathToFolderString(folders, targetFolder(), true),
			}),
			m(
				".pt-16",
				m(Checkbox, {
					label: () => lang.makeTranslation("localBodyFilterEnabled_label", "Enabled").text,
					checked: enabled(),
					onChecked: enabled,
				}),
			),
		],
		validator: () => validateLocalBodyFilter(existingRules, initialRule.id, needle(), targetFolder()._id),
		allowOkWithReturn: true,
		okAction: (dialog: Dialog) => {
			result.resolve({
				id: initialRule.id,
				needle: normalizeLocalBodyFilterNeedle(needle()),
				targetFolder: targetFolder()._id,
				enabled: enabled(),
			})
			dialog.close()
		},
		cancelAction: () => result.resolve(null),
	})

	return result.promise
}

function validateLocalBodyFilter(existingRules: readonly LocalBodyFilterRule[], ruleId: string, needle: string, targetFolder: IdTuple): TranslationKey | null {
	const normalizedNeedle = normalizeLocalBodyFilterNeedle(needle)
	if (normalizedNeedle === "") {
		return "inboxRuleEnterValue_msg"
	}

	const duplicate = existingRules.find((rule) => rule.id !== ruleId && rule.needle === normalizedNeedle && isSameId(rule.targetFolder, targetFolder))
	return duplicate == null ? null : "inboxRuleAlreadyExists_msg"
}

function normalizeLocalBodyFilterNeedle(value: string): string {
	return value.trim().toLowerCase()
}

function createLocalBodyFilterId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
