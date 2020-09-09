# Generated by Django 3.0.7 on 2020-09-09 10:50

import uuid

import django.db.models.deletion
import django.db.models.expressions
from django.conf import settings
from django.db import migrations, models


def forwards_func(apps, schema_editor):
    User = apps.get_model("posthog", "User")
    Organization = apps.get_model("posthog", "Organization")
    OrganizationMembership = apps.get_model("posthog", "OrganizationMembership")
    for user in User.objects.all():
        team = user.teams_deprecated_relationship.get()
        deterministic_derived_uuid = team.deterministic_derived_uuid
        try:
            # try to keep users from the same old team in the same new organization
            user.current_organization = Organization.objects.get(id=deterministic_derived_uuid)
        except Organization.DoesNotExist:
            # if no organization exists for the old team yet, create it
            user.current_organization = Organization.objects.create(id=deterministic_derived_uuid, name=team.name)
            team.organization = user.current_organization
            team.save()
        # migrated users become admins (level 1)
        OrganizationMembership.objects.create(organization=user.current_organization, user=user, level=1)
        user.current_team = user.current_organization.teams.get()
        user.save()


def reverse_func(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("posthog", "0083_auto_20200826_1504"),
    ]

    operations = [
        migrations.CreateModel(
            name="Organization",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=64)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
        ),
        migrations.AddField(
            model_name="user",
            name="current_team",
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to="posthog.Team"),
        ),
        migrations.AlterField(
            model_name="team",
            name="api_token",
            field=models.CharField(blank=True, max_length=200, null=True, unique=True),
        ),
        migrations.AlterField(
            model_name="team",
            name="users",
            field=models.ManyToManyField(
                blank=True, related_name="teams_deprecated_relationship", to=settings.AUTH_USER_MODEL
            ),
        ),
        migrations.AlterField(
            model_name="user",
            name="distinct_id",
            field=models.CharField(blank=True, max_length=200, null=True, unique=True),
        ),
        migrations.AlterField(
            model_name="user",
            name="temporary_token",
            field=models.CharField(blank=True, max_length=200, null=True, unique=True),
        ),
        migrations.CreateModel(
            name="OrganizationMembership",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("level", models.PositiveSmallIntegerField(choices=[(0, "member"), (1, "administrator")], default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "organization",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="memberships",
                        related_query_name="membership",
                        to="posthog.Organization",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="organization_memberships",
                        related_query_name="organization_membership",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="OrganizationInvite",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("uses", models.PositiveIntegerField(default=0)),
                ("max_uses", models.PositiveIntegerField(blank=True, default=None, null=True)),
                ("target_email", models.EmailField(blank=True, db_index=True, default=None, max_length=254, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="organization_invites",
                        related_query_name="organization_invite",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "organization",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="invites",
                        related_query_name="invite",
                        to="posthog.Organization",
                    ),
                ),
            ],
        ),
        migrations.AddField(
            model_name="organization",
            name="members",
            field=models.ManyToManyField(
                related_name="organizations",
                related_query_name="organization",
                through="posthog.OrganizationMembership",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="team",
            name="organization",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="teams",
                related_query_name="team",
                to="posthog.Organization",
            ),
        ),
        migrations.AddField(
            model_name="user",
            name="current_organization",
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to="posthog.Organization"),
        ),
        migrations.AddConstraint(
            model_name="organizationmembership",
            constraint=models.UniqueConstraint(
                fields=("organization_id", "user_id"), name="unique_organization_membership"
            ),
        ),
        migrations.AddConstraint(
            model_name="organizationinvite",
            constraint=models.CheckConstraint(
                check=models.Q(uses__lte=django.db.models.expressions.F("max_uses")), name="max_uses_respected"
            ),
        ),
        migrations.RunPython(forwards_func, reverse_func),
    ]