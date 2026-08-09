import {
  userInputQuestionSchema,
  type ProviderUserInputAnswers,
  type UserInputAnswerKind,
  type UserInputQuestion,
  type UserInputQuestionOption,
  type UserInputQuestions,
} from '@workspace/contracts'
import * as v from 'valibot'
import { asRecord, stringField } from './records'

/**
 * Pure translation between the agent SDK's `AskUserQuestion` tool and our
 * user-input contract. Both directions are keyed by the QUESTION TEXT and the
 * OPTION LABEL, because `AskUserQuestionOutput.answers` is declared as
 * `{ [question text]: string }` — a synthetic id on either side would make the
 * SDK's own answer lookup miss and the tool result come back empty.
 */

/** Anything we cannot read is dropped: an unknown shape costs that question, not the turn. */
export function claudeUserInputQuestions(toolInput: Record<string, unknown>): UserInputQuestions {
  const raw = Array.isArray(toolInput.questions) ? toolInput.questions : []
  const questions: UserInputQuestion[] = []
  for (const entry of raw) {
    const question = claudeUserInputQuestion(asRecord(entry))
    if (!question) continue

    questions.push(question)
  }

  return questions
}

/**
 * `AskUserQuestionOutput.answers` takes one string per question, with
 * multi-select picks comma-separated — so the panel's array drafts collapse
 * here rather than reaching the SDK as JSON it cannot read back.
 */
export function claudeUserInputAnswers(answers: ProviderUserInputAnswers): Record<string, string> {
  const normalized: Record<string, string> = {}
  for (const [question, answer] of Object.entries(answers)) {
    const text = claudeAnswerText(answer)
    if (!text) continue

    normalized[question] = text
  }

  return normalized
}

function claudeUserInputQuestion(record: Record<string, unknown>): UserInputQuestion | null {
  const prompt = stringField(record, 'question')?.trim()
  if (!prompt) return null

  const options = claudeQuestionOptions(record.options)
  const header = stringField(record, 'header')?.trim()
  const parsed = v.safeParse(userInputQuestionSchema, {
    allowOther: options.length > 0,
    answerKind: claudeAnswerKind(options, record.multiSelect === true),
    id: prompt,
    options,
    prompt,
    ...(header ? { header } : {}),
  })

  return parsed.success ? parsed.output : null
}

/** The tool spec forbids Claude from listing an "Other" option: the client owes one. */
function claudeAnswerKind(
  options: readonly UserInputQuestionOption[],
  multiSelect: boolean,
): UserInputAnswerKind {
  if (options.length === 0) return 'text'

  return multiSelect ? 'multi-select' : 'single-select'
}

function claudeQuestionOptions(value: unknown): UserInputQuestionOption[] {
  if (!Array.isArray(value)) return []

  const options: UserInputQuestionOption[] = []
  for (const entry of value) {
    const record = asRecord(entry)
    const label = stringField(record, 'label')?.trim()
    if (!label) continue

    const description = stringField(record, 'description')?.trim()
    options.push({ label, value: label, ...(description ? { description } : {}) })
  }

  return options
}

function claudeAnswerText(answer: unknown) {
  if (typeof answer === 'string') return answer.trim()
  if (!Array.isArray(answer)) return ''

  return answer
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .join(', ')
}
