# Generated by Django 3.0.6 on 2020-08-03 11:39

import django.db.models.deletion
from django.db import migrations, models

import posthog.models.utils


class Migration(migrations.Migration):

    dependencies = [
        ("posthog", "0073_personalapikey"),
    ]

    operations = [
        migrations.CreateModel(
            name="Hook",
            fields=[
                ("created", models.DateTimeField(auto_now_add=True)),
                ("updated", models.DateTimeField(auto_now=True)),
                ("event", models.CharField(db_index=True, max_length=64, verbose_name="Event")),
                ("target", models.URLField(max_length=255, verbose_name="Target URL")),
                (
                    "id",
                    models.CharField(
                        default=posthog.models.utils.generate_random_token,
                        max_length=50,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("resource_id", models.IntegerField(blank=True, null=True)),
                (
                    "team",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE, related_name="hooks", to="posthog.Team"
                    ),
                ),
            ],
            options={"abstract": False,},
        ),
    ]
