import { kea } from 'kea'
import { pluginsLogicType } from 'types/scenes/plugins/pluginsLogicType'
import api from 'lib/api'
import { PluginType } from '~/types'
import { PluginRepositoryEntry } from './types'

export const pluginsLogic = kea<pluginsLogicType<PluginType, PluginRepositoryEntry>>({
    actions: {
        editPlugin: (name: string | null) => ({ name }),
        saveEditedPlugin: (plugin: PluginType) => ({ plugin }),
    },

    loaders: ({ values }) => ({
        plugins: [
            {} as Record<string, PluginType>,
            {
                loadPlugins: async () => {
                    const { results } = await api.get('api/plugin')
                    const plugins: Record<string, PluginType> = {}
                    for (const plugin of results as PluginType[]) {
                        plugins[plugin.name] = plugin
                    }
                    return plugins
                },
                installPlugin: async (repositoryEntry: PluginRepositoryEntry) => {
                    const { plugins } = values
                    const nextOrder = Math.max(
                        Object.values(plugins)
                            .map((p) => p.order || 1)
                            .sort()
                            .reverse()[0] || 0,
                        Object.keys(plugins).length + 1
                    )

                    const config: Record<string, any> = {}
                    if (repositoryEntry.config) {
                        for (const [key, { default: def }] of Object.entries(repositoryEntry.config)) {
                            config[key] = def || ''
                        }
                    }

                    const response = await api.create('api/plugin', {
                        name: repositoryEntry.name,
                        description: repositoryEntry.description,
                        url: repositoryEntry.url,
                        enabled: false,
                        order: nextOrder,
                        config: config,
                        configSchema: repositoryEntry.config,
                    })

                    return { ...plugins, [response.name]: response }
                },
                saveEditedPlugin: ({ plugin }) => {
                    console.log(plugin)
                    return values.plugins
                },
            },
        ],
        repository: [
            {} as Record<string, PluginRepositoryEntry>,
            {
                loadRepository: async () => {
                    const results = await api.get('api/plugin/repository')
                    const repository: Record<string, PluginRepositoryEntry> = {}
                    for (const plugin of results as PluginRepositoryEntry[]) {
                        repository[plugin.name] = plugin
                    }
                    return repository
                },
            },
        ],
    }),

    reducers: {
        editingPluginName: [null as string | null, { editPlugin: (_, { name }) => name }],
    },

    selectors: {
        uninstalledPlugins: [
            (s) => [s.plugins, s.repository],
            (plugins, repository) => {
                return Object.keys(repository)
                    .filter((name) => !plugins[name])
                    .map((name) => repository[name])
            },
        ],
        editingPlugin: [
            (s) => [s.editingPluginName, s.plugins],
            (editingPluginName, plugins) => (editingPluginName ? plugins[editingPluginName] : null),
        ],
    },

    events: ({ actions }) => ({
        afterMount: [actions.loadPlugins, actions.loadRepository],
    }),
})
