from datetime import datetime, timezone
from itertools import accumulate
from typing import Any, Dict, List, Optional, Tuple

from ee.clickhouse.client import ch_client
from posthog.constants import TRENDS_CUMULATIVE
from posthog.models.entity import Entity
from posthog.models.filter import Filter
from posthog.models.team import Team
from posthog.queries.base import BaseQuery
from posthog.utils import relative_date_parse

# TODO: use timezone from timestamp request and not UTC remove from all below—should be localized to requester timezone
TEST_SQL = """
SELECT count(*) as total, toDateTime({interval}({timestamp}), 'UTC') as day_start from clickhouseevent where team_id = {team_id} and event = '{event}' and timestamp > '2020-08-06 00:00:00' and timestamp < '2020-08-20 00:00:00' GROUP BY {interval}({timestamp})
"""

NULL_SQL = """
SELECT toUInt16(0) AS total, {interval}(now() - number * {seconds_in_interval}) as day_start from numbers({num_intervals})
"""


class ClickhouseTrends(BaseQuery):
    def _serialize_entity(self, entity: Entity, filter: Filter, team: Team) -> Dict[str, Any]:
        serialized: Dict[str, Any] = {
            "action": entity.to_dict(),
            "label": entity.name,
            "count": 0,
            "data": [],
            "labels": [],
            "days": [],
        }
        inteval_annotation = get_interval_annotation(filter.interval)
        num_intervals, seconds_in_interval = get_time_diff(
            filter.interval or "day",
            filter.date_from or relative_date_parse("-14d"),
            filter.date_to or datetime.now(timezone.utc),
        )

        # TODO: remove hardcoded params
        content_sql = TEST_SQL.format(
            interval=inteval_annotation, timestamp="timestamp", team_id=team.pk, event="$pageview"
        )
        null_sql = NULL_SQL.format(
            interval=inteval_annotation, seconds_in_interval=seconds_in_interval, num_intervals=num_intervals
        )

        result = ch_client.execute(
            "SELECT SUM(total), day_start from ({null_sql} UNION ALL {content_sql}) group by day_start order by day_start".format(
                null_sql=null_sql, content_sql=content_sql
            )
        )

        counts = [item[0] for item in result]
        dates = [item[1].strftime("%Y-%m-%d") for item in result]
        labels = [item[1].strftime("%a. %-d %B") for item in result]
        serialized.update(data=counts, labels=labels, days=dates, count=sum(counts))

        if filter.display == TRENDS_CUMULATIVE:
            serialized.update(data=list(accumulate(counts)))

        return serialized

    def _calculate_trends(self, filter: Filter, team: Team) -> List[Dict[str, Any]]:
        result = []
        for entity in filter.entities:
            entity_result = self._serialize_entity(entity, filter, team)
            result.append(entity_result)

        return result

    def run(self, filter: Filter, team: Team, *args, **kwargs) -> List[Dict[str, Any]]:
        return self._calculate_trends(filter, team)


def get_interval_annotation(interval: Optional[str]) -> str:
    if interval is None:
        return "toStartOfDay"

    map: Dict[str, Any] = {
        "minute": "toStartOfMinute",
        "hour": "toStartOfHour",
        "day": "toStartOfDay",
        "week": "toStartOfWeek",
        "month": "toStartOfMonth",
    }
    return map.get(interval)


def get_time_diff(interval: str, start_time: datetime, end_time: datetime) -> Tuple[int, int]:

    time_diffs: Dict[str, Any] = {
        "minute": 60,
        "hour": 3600,
        "day": 3600 * 24,
        "week": 3600 * 24 * 7,
        "month": 3600 * 24 * 7 * 30,
    }

    diff = end_time - start_time

    return int(diff.total_seconds() / time_diffs[interval]), time_diffs[interval]
