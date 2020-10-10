import json
from typing import Any, Dict

import requests
from rest_framework import request, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from posthog.models import Plugin, PluginConfig
from posthog.plugins import Plugins


class PluginSerializer(serializers.ModelSerializer):
    class Meta:
        model = Plugin
        fields = ["id", "name", "description", "url", "configSchema", "tag"]

    def create(self, validated_data: Dict, *args: Any, **kwargs: Any) -> Plugin:
        request = self.context["request"]
        validated_data["archive"] = self._download_github_zip(validated_data["url"], validated_data["tag"])
        plugin = Plugin.objects.create(**validated_data)
        Plugins().publish_reload_command()
        return plugin

    def update(self, plugin: Plugin, validated_data: Dict, *args: Any, **kwargs: Any) -> Plugin:  # type: ignore
        plugin.name = validated_data.get("name", plugin.name)
        plugin.description = validated_data.get("description", plugin.description)
        plugin.url = validated_data.get("url", plugin.url)
        plugin.configSchema = validated_data.get("configSchema", plugin.configSchema)
        plugin.tag = validated_data.get("tag", plugin.tag)
        plugin.archive = self._download_github_zip(plugin.url, plugin.tag)
        plugin.save()
        Plugins().publish_reload_command()
        return plugin

    def _download_github_zip(self, repo: str, tag: str):
        URL_TEMPLATE = "{repo}/archive/{tag}.zip"
        url = URL_TEMPLATE.format(repo=repo, tag=tag)
        response = requests.get(url)
        if not response.ok:
            raise Exception("Could not download archive from GitHub")
        return response.content


class PluginViewSet(viewsets.ModelViewSet):
    queryset = Plugin.objects.all()
    serializer_class = PluginSerializer

    @action(methods=["GET"], detail=False)
    def repository(self, request: request.Request):
        url = "https://raw.githubusercontent.com/PostHog/plugins/main/plugins.json"
        plugins = requests.get(url)
        return Response(json.loads(plugins.text))


class PluginConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = PluginConfig
        fields = ["id", "plugin", "enabled", "order", "config"]

    def create(self, validated_data: Dict, *args: Any, **kwargs: Any) -> PluginConfig:
        request = self.context["request"]
        plugin_config = PluginConfig.objects.create(team=request.user.team, **validated_data)
        Plugins().publish_reload_command()
        return plugin_config

    def update(self, plugin_config: PluginConfig, validated_data: Dict, *args: Any, **kwargs: Any) -> PluginConfig:  # type: ignore
        plugin_config.enabled = validated_data.get("enabled", plugin_config.enabled)
        plugin_config.config = validated_data.get("config", plugin_config.config)
        plugin_config.order = validated_data.get("order", plugin_config.order)
        plugin_config.save()
        Plugins().publish_reload_command()
        return plugin_config


class PluginConfigViewSet(viewsets.ModelViewSet):
    queryset = PluginConfig.objects.all()
    serializer_class = PluginConfigSerializer