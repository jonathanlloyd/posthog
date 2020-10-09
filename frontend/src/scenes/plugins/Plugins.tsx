import React from 'react'
import { Button, Col, Row, Table, Tooltip } from 'antd'
import { hot } from 'react-hot-loader/root'
import { useActions, useValues } from 'kea'
import { pluginsLogic } from 'scenes/plugins/pluginsLogic'
import { PluginType } from '~/types'
import { DownloadOutlined, GithubOutlined, CheckOutlined, ToolOutlined, PauseOutlined } from '@ant-design/icons'
import { PluginRepositoryEntry } from 'scenes/plugins/types'
import { PluginModal } from 'scenes/plugins/PluginModal'

export const Plugins = hot(_Plugins)
function _Plugins(): JSX.Element {
    const { plugins, pluginsLoading, repositoryLoading, uninstalledPlugins } = useValues(pluginsLogic)
    const { installPlugin, editPlugin } = useActions(pluginsLogic)

    return (
        <div>
            <h1 className="page-header">Installed Plugins</h1>
            <Table
                data-attr="plugins-table"
                size="small"
                rowKey={(plugin) => plugin.name}
                pagination={{ pageSize: 99999, hideOnSinglePage: true }}
                dataSource={Object.values(plugins)}
                columns={[
                    {
                        title: 'Plugin',
                        key: 'name',
                        render: function RenderPlugin(plugin: PluginType): JSX.Element {
                            return (
                                <>
                                    <Row>
                                        <Col>
                                            <strong>{plugin.name}</strong>
                                        </Col>
                                    </Row>
                                    <Row gutter={16}>
                                        <Col>
                                            {plugin.enabled ? (
                                                <div style={{ color: 'var(--green)' }}>
                                                    <CheckOutlined /> Enabled
                                                </div>
                                            ) : (
                                                <div style={{ color: 'var(--orange)' }}>
                                                    <PauseOutlined /> Disabled
                                                </div>
                                            )}
                                        </Col>
                                        <Col>
                                            <a href={plugin.url} target="_blank" rel="noreferrer noopener">
                                                <GithubOutlined /> Repository
                                            </a>
                                        </Col>
                                    </Row>
                                </>
                            )
                        },
                    },
                    {
                        title: 'Description',
                        key: 'description',
                        render: function RenderDescription(plugin: PluginType): JSX.Element {
                            return <div>{plugin.description}</div>
                        },
                    },
                    {
                        title: '',
                        key: 'config',
                        align: 'right',
                        render: function RenderConfig(plugin: PluginType): JSX.Element {
                            return (
                                <Tooltip title="Configure">
                                    <Button
                                        type="primary"
                                        icon={<ToolOutlined />}
                                        onClick={() => editPlugin(plugin.name)}
                                    />
                                </Tooltip>
                            )
                        },
                    },
                ]}
                loading={pluginsLoading}
                locale={{ emptyText: 'No Plugins Installed!' }}
            />

            <br />

            <h1 className="page-header">Plugins To Install</h1>
            <Table
                data-attr="plugins-table"
                size="small"
                rowKey={(plugin) => plugin.name}
                pagination={{ pageSize: 99999, hideOnSinglePage: true }}
                dataSource={uninstalledPlugins}
                columns={[
                    {
                        title: 'Plugin',
                        key: 'name',
                        render: function RenderPlugin(plugin: PluginType): JSX.Element {
                            return (
                                <a href={plugin.url} target="_blank" rel="noreferrer noopener">
                                    {plugin.name}
                                </a>
                            )
                        },
                    },
                    {
                        title: 'Description',
                        key: 'description',
                        render: function RenderDescription(plugin: PluginRepositoryEntry): JSX.Element {
                            return <div>{plugin.description}</div>
                        },
                    },
                    {
                        title: '',
                        key: 'install',
                        align: 'right',
                        render: function RenderInstall(plugin: PluginRepositoryEntry): JSX.Element {
                            return (
                                <Tooltip title="Install">
                                    <Button
                                        type="primary"
                                        onClick={() => installPlugin(plugin)}
                                        icon={<DownloadOutlined />}
                                    />
                                </Tooltip>
                            )
                        },
                    },
                ]}
                loading={pluginsLoading || repositoryLoading}
                locale={{ emptyText: 'All Plugins Installed!' }}
            />
            <PluginModal />
        </div>
    )
}
