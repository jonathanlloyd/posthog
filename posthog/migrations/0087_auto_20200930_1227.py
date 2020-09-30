# Generated by Django 3.0.7 on 2020-09-30 12:27

from django.db import migrations, models

import posthog.models.utils


class Migration(migrations.Migration):

    dependencies = [
        ("posthog", "0086_org_live"),
    ]

    operations = [
        migrations.AlterField(
            model_name="person",
            name="uuid",
            field=models.UUIDField(db_index=True, default=posthog.models.utils.UUIDT, editable=False),
        ),
    ]
