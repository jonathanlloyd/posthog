import { kea } from 'kea'
import { router } from 'kea-router'
import { commandPaletteLogicType } from 'types/lib/components/CommandPalette/commandPaletteLogicType'
import Fuse from 'fuse.js'
import { dashboardsModel } from '~/models/dashboardsModel'
import { Parser } from 'expr-eval'
import _ from 'lodash'
import {
    CommentOutlined,
    FundOutlined,
    RiseOutlined,
    ContainerOutlined,
    AimOutlined,
    CheckOutlined,
    SyncOutlined,
    TagOutlined,
    ClockCircleOutlined,
    UserOutlined,
    UsergroupAddOutlined,
    ExperimentOutlined,
    SettingOutlined,
    MessageOutlined,
    TeamOutlined,
    LinkOutlined,
    CalculatorOutlined,
    FunnelPlotOutlined,
    GatewayOutlined,
    InteractionOutlined,
    MailOutlined,
    KeyOutlined,
    VideoCameraOutlined,
    SendOutlined,
    LogoutOutlined,
    PlusOutlined,
    LineChartOutlined,
} from '@ant-design/icons'
import { DashboardType } from '~/types'
import api from 'lib/api'
import { appUrlsLogic } from '../AppEditorLink/appUrlsLogic'
import { copyToClipboard, isURL } from 'lib/utils'
import { personalAPIKeysLogic } from '../PersonalAPIKeys/personalAPIKeysLogic'

// If CommandExecutor returns CommandFlow, flow will be entered
export type CommandExecutor = () => CommandFlow | void

export interface CommandResultTemplate {
    icon: any // any, because Ant Design icons are some weird ForwardRefExoticComponent type
    display: string
    synonyms?: string[]
    prefixApplied?: string
    executor?: CommandExecutor | true // true means "just clear input"
    guarantee?: boolean // show result always and first, regardless of fuzzy search
}

export type CommandResult = CommandResultTemplate & {
    source: Command | CommandFlow
    index?: number
}

export type CommandResolver = (
    argument?: string,
    prefixApplied?: string
) => CommandResultTemplate[] | CommandResultTemplate | null

export interface Command {
    key: string // Unique command identification key
    prefixes?: string[] // Command prefixes, e.g. "go to". Prefix-less case is dynamic base command (e.g. Dashboard)
    resolver: CommandResolver | CommandResultTemplate[] | CommandResultTemplate // Resolver based on arguments (prefix excluded)
    scope: string
}

export interface CommandFlow {
    icon?: any
    instruction?: string
    resolver: CommandResolver | CommandResultTemplate[] | CommandResultTemplate
    scope: string
}

export type CommandRegistrations = {
    [commandKey: string]: Command
}

export type RegExpCommandPairs = [RegExp | null, Command][]

const RESULTS_MAX = 5

const GLOBAL_COMMAND_SCOPE = 'global'

function resolveCommand(source: Command | CommandFlow, argument?: string, prefixApplied?: string): CommandResult[] {
    // run resolver or use ready-made results
    let results = source.resolver instanceof Function ? source.resolver(argument, prefixApplied) : source.resolver
    if (!results) return [] // skip if no result
    if (!Array.isArray(results)) results = [results] // work with a single result and with an array of results
    const resultsWithCommand: CommandResult[] = results.map((result) => {
        return { ...result, source }
    })
    return resultsWithCommand
}

export const commandPaletteLogic = kea<
    commandPaletteLogicType<Command, CommandRegistrations, CommandResult, CommandFlow, RegExpCommandPairs>
>({
    connect: {
        actions: [personalAPIKeysLogic, ['createKey']],
        values: [appUrlsLogic, ['appUrls', 'suggestions']],
    },
    actions: {
        hidePalette: true,
        showPalette: true,
        togglePalette: true,
        setInput: (input: string) => ({ input }),
        onArrowUp: true,
        onArrowDown: (maxIndex: number) => ({ maxIndex }),
        onMouseEnterResult: (index: number) => ({ index }),
        onMouseLeaveResult: true,
        executeResult: (result: CommandResult) => ({ result }),
        activateFlow: (flow: CommandFlow | null) => ({ flow }),
        registerCommand: (command: Command) => ({ command }),
        deregisterCommand: (commandKey: string) => ({ commandKey }),
        setCustomCommand: (commandKey: string) => ({ commandKey }),
        deregisterScope: (scope: string) => ({ scope }),
    },
    reducers: {
        isPaletteShown: [
            false,
            {
                hidePalette: () => false,
                showPalette: () => true,
                togglePalette: (previousState) => !previousState,
            },
        ],
        keyboardResultIndex: [
            0,
            {
                setInput: () => 0,
                executeResult: () => 0,
                activateFlow: () => 0,
                onArrowUp: (previousIndex) => (previousIndex > 0 ? previousIndex - 1 : 0),
                onArrowDown: (previousIndex, { maxIndex }) => (previousIndex < maxIndex ? previousIndex + 1 : maxIndex),
            },
        ],
        hoverResultIndex: [
            null as number | null,
            {
                onMouseEnterResult: (_, { index }) => index,
                onMouseLeaveResult: () => null,
                onArrowUp: () => null,
                onArrowDown: () => null,
                activateFlow: () => null,
            },
        ],
        input: [
            '',
            {
                setInput: (_, { input }) => input,
                activateFlow: () => '',
                executeResult: () => '',
            },
        ],
        activeFlow: [
            null as CommandFlow | null,
            {
                activateFlow: (_, { flow }) => flow,
            },
        ],
        rawCommandRegistrations: [
            {} as CommandRegistrations,
            {
                registerCommand: (commands, { command }) => {
                    return { ...commands, [command.key]: command }
                },
                deregisterCommand: (commands, { commandKey }) => {
                    const { [commandKey]: _, ...cleanedCommands } = commands // eslint-disable-line
                    return cleanedCommands
                },
            },
        ],
    },

    listeners: ({ actions, values }) => ({
        showPalette: () => {
            window.posthog?.capture('palette shown')
        },
        togglePalette: () => {
            if (values.isPaletteShown) window.posthog?.capture('palette shown')
        },
        executeResult: ({ result }: { result: CommandResult }) => {
            if (result.executor === true) {
                actions.activateFlow(null)
            } else {
                const possibleFlow = result.executor?.() ?? null
                actions.activateFlow(possibleFlow)
                if (!possibleFlow) actions.hidePalette()
            }
            // Capture command execution, without useless data
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { icon, index, ...cleanedResult }: Record<string, any> = result
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { resolver, ...cleanedCommand } = cleanedResult.source
            cleanedResult.source = cleanedCommand
            window.posthog?.capture('palette command executed', cleanedResult)
        },
        deregisterScope: ({ scope }) => {
            for (const command of Object.values(values.commandRegistrations)) {
                if (command.scope === scope) actions.deregisterCommand(command.key)
            }
        },
        setInput: async ({ input }, breakpoint) => {
            await breakpoint(300)
            if (input.length > 8) {
                const response = await api.get('api/person/?key_identifier=' + input)
                const person = response.results[0]
                if (person) {
                    actions.registerCommand({
                        key: `person-${person.distinct_ids[0]}`,
                        resolver: [
                            {
                                icon: UserOutlined,
                                display: `View person ${input}`,
                                executor: () => {
                                    const { push } = router.actions
                                    push(`/person/${person.distinct_ids[0]}`)
                                },
                            },
                        ],
                        scope: GLOBAL_COMMAND_SCOPE,
                    })
                }
            }
        },
    }),
    selectors: {
        isSqueak: [
            (selectors) => [selectors.input],
            (input: string) => {
                return input.trim().toLowerCase() === 'squeak'
            },
        ],
        activeResultIndex: [
            (selectors) => [selectors.keyboardResultIndex, selectors.hoverResultIndex],
            (keyboardResultIndex: number, hoverResultIndex: number | null) => {
                return hoverResultIndex ?? keyboardResultIndex
            },
        ],
        commandRegistrations: [
            (selectors) => [
                selectors.rawCommandRegistrations,
                dashboardsModel.selectors.dashboards,
                appUrlsLogic({ actionId: null }).selectors.appUrls,
                appUrlsLogic({ actionId: null }).selectors.suggestions,
            ],
            (rawCommandRegistrations: CommandRegistrations, dashboards: DashboardType[]): CommandRegistrations => ({
                ...rawCommandRegistrations,
                custom_dashboards: {
                    key: 'custom_dashboards',
                    resolver: dashboards.map((dashboard: DashboardType) => ({
                        key: `dashboard_${dashboard.id}`,
                        icon: LineChartOutlined,
                        display: `Go to Dashboard ${dashboard.name}`,
                        executor: () => {
                            const { push } = router.actions
                            push(`/dashboard/${dashboard.id}`)
                        },
                    })),
                    scope: GLOBAL_COMMAND_SCOPE,
                },
            }),
        ],
        regexpCommandPairs: [
            (selectors) => [selectors.commandRegistrations],
            (commandRegistrations: CommandRegistrations) => {
                const array: RegExpCommandPairs = []
                for (const command of Object.values(commandRegistrations)) {
                    if (command.prefixes)
                        array.push([new RegExp(`^\\s*(${command.prefixes.join('|')})(?:\\s+(.*)|$)`, 'i'), command])
                    else array.push([null, command])
                }
                return array
            },
        ],
        commandSearchResults: [
            (selectors) => [selectors.regexpCommandPairs, selectors.input, selectors.activeFlow, selectors.isSqueak],
            (
                regexpCommandPairs: RegExpCommandPairs,
                argument: string,
                activeFlow: CommandFlow | null,
                isSqueak: boolean
            ) => {
                if (isSqueak) return []
                if (activeFlow) return resolveCommand(activeFlow, argument)
                let directResults: CommandResult[] = []
                let prefixedResults: CommandResult[] = []
                for (const [regexp, command] of regexpCommandPairs) {
                    if (regexp) {
                        const match = argument.match(regexp)
                        if (match && match[1]) {
                            prefixedResults = [...prefixedResults, ...resolveCommand(command, match[2], match[1])]
                        }
                    }
                    directResults = [...directResults, ...resolveCommand(command, argument)]
                }
                const allResults = directResults.concat(prefixedResults)
                let fusableResults: CommandResult[] = []
                let guaranteedResults: CommandResult[] = []
                for (const result of allResults) {
                    if (result.guarantee) guaranteedResults.push(result)
                    else fusableResults.push(result)
                }
                fusableResults = _.uniqBy(fusableResults, 'display')
                guaranteedResults = _.uniqBy(guaranteedResults, 'display')
                const fusedResults = argument
                    ? new Fuse(fusableResults, {
                          keys: ['display', 'synonyms'],
                      })
                          .search(argument)
                          .slice(0, RESULTS_MAX)
                          .map((result) => result.item)
                    : _.sampleSize(fusableResults, RESULTS_MAX - guaranteedResults.length)
                const finalResults = guaranteedResults.concat(fusedResults)
                // put global scope last
                return finalResults.sort((resultA, resultB) =>
                    resultA.source.scope === resultB.source.scope
                        ? 0
                        : resultA.source.scope === GLOBAL_COMMAND_SCOPE
                        ? 1
                        : -1
                )
            },
        ],
        commandSearchResultsGrouped: [
            (selectors) => [selectors.commandSearchResults, selectors.activeFlow],
            (commandSearchResults: CommandResult[], activeFlow: CommandFlow | null) => {
                const resultsGrouped: { [scope: string]: CommandResult[] } = {}
                if (activeFlow) resultsGrouped[activeFlow.scope] = []
                for (const result of commandSearchResults) {
                    const scope: string = result.source.scope
                    if (!(scope in resultsGrouped)) resultsGrouped[scope] = [] // Ensure there's an array to push to
                    resultsGrouped[scope].push({ ...result })
                }
                let rollingIndex = 0
                const resultsGroupedInOrder = Object.entries(resultsGrouped)
                for (const [, group] of resultsGroupedInOrder) {
                    for (const result of group) {
                        result.index = rollingIndex++
                    }
                }
                return resultsGroupedInOrder
            },
        ],
    },

    events: ({ actions }) => ({
        afterMount: () => {
            const { push } = router.actions

            const goTo: Command = {
                key: 'go-to',
                scope: GLOBAL_COMMAND_SCOPE,
                prefixes: ['open', 'visit'],
                resolver: [
                    {
                        icon: FundOutlined,
                        display: 'Go to Dashboards',
                        executor: () => {
                            push('/dashboard')
                        },
                    },
                    {
                        icon: RiseOutlined,
                        display: 'Go to Insights',
                        executor: () => {
                            push('/insights')
                        },
                    },
                    {
                        icon: RiseOutlined,
                        display: 'Go to Trends',
                        executor: () => {
                            // FIXME: Don't reset insight on change
                            push('/insights?insight=TRENDS')
                        },
                    },
                    {
                        icon: ClockCircleOutlined,
                        display: 'Go to Sessions',
                        executor: () => {
                            // FIXME: Don't reset insight on change
                            push('/insights?insight=SESSIONS')
                        },
                    },
                    {
                        icon: FunnelPlotOutlined,
                        display: 'Go to Funnels',
                        executor: () => {
                            // FIXME: Don't reset insight on change
                            push('/insights?insight=FUNNELS')
                        },
                    },
                    {
                        icon: GatewayOutlined,
                        display: 'Go to Retention',
                        executor: () => {
                            // FIXME: Don't reset insight on change
                            push('/insights?insight=RETENTION')
                        },
                    },
                    {
                        icon: InteractionOutlined,
                        display: 'Go to User Paths',
                        executor: () => {
                            // FIXME: Don't reset insight on change
                            push('/insights?insight=PATHS')
                        },
                    },
                    {
                        icon: ContainerOutlined,
                        display: 'Go to Events',
                        executor: () => {
                            push('/events')
                        },
                    },
                    {
                        icon: AimOutlined,
                        display: 'Go to Actions',
                        executor: () => {
                            push('/actions')
                        },
                    },
                    {
                        icon: SyncOutlined,
                        display: 'Go to Live Actions',
                        executor: () => {
                            push('/actions/live')
                        },
                    },
                    {
                        icon: ClockCircleOutlined,
                        display: 'Go to Live Sessions',
                        executor: () => {
                            push('/sessions')
                        },
                    },
                    {
                        icon: UserOutlined,
                        display: 'Go to People',
                        synonyms: ['people'],
                        executor: () => {
                            push('/people')
                        },
                    },
                    {
                        icon: UsergroupAddOutlined,
                        display: 'Go to Cohorts',
                        executor: () => {
                            push('/people/cohorts')
                        },
                    },
                    {
                        icon: ExperimentOutlined,
                        display: 'Go to Experiments',
                        synonyms: ['feature flags', 'a/b tests'],
                        executor: () => {
                            push('/experiments/feature_flags')
                        },
                    },
                    {
                        icon: SettingOutlined,
                        display: 'Go to Setup',
                        synonyms: ['settings', 'configuration'],
                        executor: () => {
                            push('/setup')
                        },
                    },
                    {
                        icon: MessageOutlined,
                        display: 'Go to Annotations',
                        executor: () => {
                            push('/annotations')
                        },
                    },
                    {
                        icon: TeamOutlined,
                        display: 'Go to Team',
                        executor: () => {
                            push('/team')
                        },
                    },
                    {
                        icon: PlusOutlined,
                        display: 'Create Action',
                        executor: () => {
                            push('/action')
                        },
                    },
                    {
                        icon: LogoutOutlined,
                        display: 'Log Out',
                        executor: () => {
                            window.location.href = '/logout'
                        },
                    },
                ],
            }

            const calculator: Command = {
                key: 'calculator',
                scope: GLOBAL_COMMAND_SCOPE,
                resolver: (argument) => {
                    // don't try evaluating if there's no argument or if it's a plain number already
                    if (!argument || !isNaN(+argument)) return null
                    try {
                        const result = +Parser.evaluate(argument)
                        return isNaN(result)
                            ? null
                            : {
                                  icon: CalculatorOutlined,
                                  display: `= ${result}`,
                                  guarantee: true,
                                  executor: () => {
                                      copyToClipboard(result.toString(), 'calculation result')
                                  },
                              }
                    } catch {
                        return null
                    }
                },
            }

            const openUrls: Command = {
                key: 'open-urls',
                scope: GLOBAL_COMMAND_SCOPE,
                prefixes: ['open', 'visit'],
                resolver: (argument) => {
                    const results: CommandResultTemplate[] = (appUrlsLogic.values.appUrls ?? [])
                        .concat(appUrlsLogic.values.suggestedUrls ?? [])
                        .map((url: string) => ({
                            icon: LinkOutlined,
                            display: `Open ${url}`,
                            synonyms: [`Visit ${url}`],
                            executor: () => {
                                open(url)
                            },
                        }))
                    if (isURL(argument))
                        results.push({
                            icon: LinkOutlined,
                            display: `Open ${argument}`,
                            synonyms: [`Visit ${argument}`],
                            executor: () => {
                                open(argument)
                            },
                        })
                    results.push({
                        icon: LinkOutlined,
                        display: 'Open PostHog Docs',
                        synonyms: ['technical documentation'],
                        executor: () => {
                            open('https://posthog.com/docs')
                        },
                    })
                    return results
                },
            }

            const createPersonalApiKey: Command = {
                key: 'create-personal-api-key',
                scope: GLOBAL_COMMAND_SCOPE,
                resolver: {
                    icon: KeyOutlined,
                    display: 'Create Personal API Key',
                    executor: () => ({
                        instruction: 'Give your key a label',
                        icon: TagOutlined,
                        scope: 'Creating Personal API Key',
                        resolver: (argument) => {
                            if (argument?.length)
                                return {
                                    icon: KeyOutlined,
                                    display: `Create Key "${argument}"`,
                                    executor: () => {
                                        personalAPIKeysLogic.actions.createKey(argument)
                                        push('/setup', {}, 'personal-api-keys')
                                    },
                                }
                            return null
                        },
                    }),
                },
            }

            const createDashboard: Command = {
                key: 'create-dashboard',
                scope: GLOBAL_COMMAND_SCOPE,
                resolver: {
                    icon: FundOutlined,
                    display: 'Create Dashboard',
                    executor: () => ({
                        instruction: 'Name your new dashboard',
                        icon: TagOutlined,
                        scope: 'Creating Dashboard',
                        resolver: (argument) => {
                            if (argument?.length)
                                return {
                                    icon: FundOutlined,
                                    display: `Create Dashboard "${argument}"`,
                                    executor: () => {
                                        dashboardsModel.actions.addDashboard({ name: argument, push: true })
                                    },
                                }
                            return null
                        },
                    }),
                },
            }

            const shareFeedback: Command = {
                key: 'share-feedback',
                scope: GLOBAL_COMMAND_SCOPE,
                resolver: {
                    icon: CommentOutlined,
                    display: 'Share Feedback',
                    synonyms: ['send opinion', 'ask question', 'message posthog'],
                    executor: () => ({
                        scope: 'Sharing Feedback',
                        instruction: "What's on your mind?",
                        icon: CommentOutlined,
                        resolver: (argument) => [
                            {
                                icon: SendOutlined,
                                display: 'Send Message Directly to PostHog',
                                executor: !argument?.length
                                    ? undefined
                                    : () => {
                                          window.posthog?.capture('palette feedback', { message: argument })
                                          return {
                                              scope: 'Sharing Feedback',
                                              resolver: {
                                                  icon: CheckOutlined,
                                                  display: 'Message Sent!',
                                                  executor: true,
                                              },
                                          }
                                      },
                            },
                            {
                                icon: VideoCameraOutlined,
                                display: 'Schedule Quick Call',
                                executor: () => {
                                    open('https://calendly.com/posthog-feedback')
                                },
                            },
                            {
                                icon: MailOutlined,
                                display: 'Email Core Team',
                                executor: () => {
                                    open('mailto:hey@posthog.com')
                                },
                            },
                        ],
                    }),
                },
            }

            actions.registerCommand(goTo)
            actions.registerCommand(openUrls)
            actions.registerCommand(calculator)
            actions.registerCommand(createPersonalApiKey)
            actions.registerCommand(createDashboard)
            actions.registerCommand(shareFeedback)
        },
        beforeUnmount: () => {
            actions.deregisterCommand('go-to')
            actions.deregisterCommand('open-urls')
            actions.deregisterCommand('calculator')
            actions.deregisterCommand('create-personal-api-key')
            actions.deregisterCommand('create-dashboard')
            actions.deregisterCommand('share-feedback')
        },
    }),
})
