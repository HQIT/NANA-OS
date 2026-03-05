"""将不同来源的 webhook payload 标准化为 CloudEvents 格式。

设计为可插拔的 normalizer 注册表，通过 HTTP header 自动识别平台。
所有 Git 平台统一映射到 git.* 事件类型，订阅方无需关心具体平台。
"""

from __future__ import annotations

import hashlib
import hmac
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any

# ── CloudEvent 数据结构 ──

CloudEvent = dict[str, Any]


def _make_event(
    *,
    source: str,
    event_type: str,
    subject: str = "",
    data: dict,
) -> CloudEvent:
    return {
        "specversion": "1.0",
        "id": f"evt_{uuid.uuid4().hex[:12]}",
        "source": source,
        "type": event_type,
        "subject": subject,
        "time": datetime.now(timezone.utc).isoformat(),
        "data": data,
    }


# ── Base Normalizer ──


class BaseNormalizer(ABC):
    """所有 normalizer 的基类。"""

    @abstractmethod
    def detect(self, headers: dict[str, str]) -> bool:
        """根据 HTTP header 判断是否属于本平台。"""

    @abstractmethod
    def normalize(self, headers: dict[str, str], payload: dict) -> CloudEvent:
        """将原始 webhook payload 转换为 CloudEvent。"""

    def verify_signature(self, headers: dict[str, str], body: bytes, secret: str) -> bool:
        """验证 webhook 签名，默认跳过。子类按需覆盖。"""
        return True


# ── GitHub ──

_GITHUB_EVENT_MAP: dict[tuple[str, str], str] = {
    ("issues", "opened"): "git.issue.opened",
    ("issues", "closed"): "git.issue.closed",
    ("issues", "reopened"): "git.issue.reopened",
    ("issues", "edited"): "git.issue.edited",
    ("issue_comment", "created"): "git.issue.comment_created",
    ("pull_request", "opened"): "git.pull_request.created",
    ("pull_request", "closed"): "git.pull_request.closed",
    ("pull_request", "synchronize"): "git.pull_request.synchronize",
    ("pull_request", "reopened"): "git.pull_request.reopened",
    ("pull_request", "edited"): "git.pull_request.edited",
    ("pull_request_review", "submitted"): "git.pull_request.review_submitted",
    ("pull_request_review_comment", "created"): "git.pull_request.review_comment_created",
    ("push", ""): "git.push",
}


class GitHubNormalizer(BaseNormalizer):

    def detect(self, headers: dict[str, str]) -> bool:
        return "x-github-event" in headers

    def verify_signature(self, headers: dict[str, str], body: bytes, secret: str) -> bool:
        if not secret:
            return True
        sig_header = headers.get("x-hub-signature-256", "")
        if not sig_header.startswith("sha256="):
            return False
        expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        return hmac.compare_digest(sig_header[7:], expected)

    def normalize(self, headers: dict[str, str], payload: dict) -> CloudEvent:
        gh_event = headers.get("x-github-event", "")
        action = payload.get("action", "")
        repo = payload.get("repository", {}).get("full_name", "unknown")

        event_type = _GITHUB_EVENT_MAP.get(
            (gh_event, action),
            _GITHUB_EVENT_MAP.get((gh_event, ""), f"github.{gh_event}.{action}"),
        )

        subject = ""
        if "issue" in payload:
            subject = f"issue/{payload['issue']['number']}"
        elif "pull_request" in payload:
            subject = f"pr/{payload['pull_request']['number']}"
        elif "ref" in payload:
            subject = payload["ref"]

        return _make_event(
            source=f"github/{repo}",
            event_type=event_type,
            subject=subject,
            data=payload,
        )


# ── GitLab ──

_GITLAB_EVENT_MAP: dict[str, str] = {
    "Issue Hook": "git.issue.opened",
    "Merge Request Hook": "git.pull_request.created",
    "Push Hook": "git.push",
    "Tag Push Hook": "git.push",
    "Note Hook": "git.comment.created",
    "Pipeline Hook": "gitlab.pipeline",
    "Job Hook": "gitlab.job",
}


class GitLabNormalizer(BaseNormalizer):

    def detect(self, headers: dict[str, str]) -> bool:
        return "x-gitlab-event" in headers

    def verify_signature(self, headers: dict[str, str], body: bytes, secret: str) -> bool:
        if not secret:
            return True
        token = headers.get("x-gitlab-token", "")
        return hmac.compare_digest(token, secret)

    def normalize(self, headers: dict[str, str], payload: dict) -> CloudEvent:
        gl_event = headers.get("x-gitlab-event", "")
        project = payload.get("project", {})
        repo = project.get("path_with_namespace", "unknown")

        base_type = _GITLAB_EVENT_MAP.get(gl_event, f"gitlab.{gl_event}")

        # 细化 Merge Request 事件
        event_type = base_type
        if gl_event == "Merge Request Hook":
            action = payload.get("object_attributes", {}).get("action", "")
            mr_action_map = {
                "open": "git.pull_request.created",
                "reopen": "git.pull_request.reopened",
                "close": "git.pull_request.closed",
                "merge": "git.pull_request.closed",
                "update": "git.pull_request.synchronize",
                "approved": "git.pull_request.review_submitted",
            }
            event_type = mr_action_map.get(action, base_type)

        # 细化 Issue 事件
        if gl_event == "Issue Hook":
            action = payload.get("object_attributes", {}).get("action", "")
            issue_action_map = {
                "open": "git.issue.opened",
                "reopen": "git.issue.reopened",
                "close": "git.issue.closed",
                "update": "git.issue.edited",
            }
            event_type = issue_action_map.get(action, base_type)

        subject = ""
        obj = payload.get("object_attributes", {})
        if obj.get("iid"):
            kind = "mr" if "merge" in gl_event.lower() else "issue"
            subject = f"{kind}/{obj['iid']}"
        elif "ref" in payload:
            subject = payload["ref"]

        return _make_event(
            source=f"gitlab/{repo}",
            event_type=event_type,
            subject=subject,
            data=payload,
        )


# ── Gitea ──

_GITEA_EVENT_MAP: dict[tuple[str, str], str] = {
    ("issues", "opened"): "git.issue.opened",
    ("issues", "closed"): "git.issue.closed",
    ("issues", "reopened"): "git.issue.reopened",
    ("issues", "edited"): "git.issue.edited",
    ("issue_comment", "created"): "git.issue.comment_created",
    ("pull_request", "opened"): "git.pull_request.created",
    ("pull_request", "closed"): "git.pull_request.closed",
    ("pull_request", "synchronized"): "git.pull_request.synchronize",
    ("pull_request", "reopened"): "git.pull_request.reopened",
    ("pull_request", "edited"): "git.pull_request.edited",
    ("pull_request_approved", ""): "git.pull_request.review_submitted",
    ("pull_request_review_comment", "created"): "git.pull_request.review_comment_created",
    ("push", ""): "git.push",
}


class GiteaNormalizer(BaseNormalizer):

    def detect(self, headers: dict[str, str]) -> bool:
        return "x-gitea-event" in headers

    def verify_signature(self, headers: dict[str, str], body: bytes, secret: str) -> bool:
        if not secret:
            return True
        sig_header = headers.get("x-gitea-signature", "")
        if not sig_header:
            return False
        expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        return hmac.compare_digest(sig_header, expected)

    def normalize(self, headers: dict[str, str], payload: dict) -> CloudEvent:
        gt_event = headers.get("x-gitea-event", "")
        action = payload.get("action", "")
        repo = payload.get("repository", {}).get("full_name", "unknown")

        event_type = _GITEA_EVENT_MAP.get(
            (gt_event, action),
            _GITEA_EVENT_MAP.get((gt_event, ""), f"gitea.{gt_event}.{action}"),
        )

        subject = ""
        if "issue" in payload:
            subject = f"issue/{payload['issue']['number']}"
        elif "pull_request" in payload:
            subject = f"pr/{payload['pull_request']['number']}"
        elif "ref" in payload:
            subject = payload["ref"]

        return _make_event(
            source=f"gitea/{repo}",
            event_type=event_type,
            subject=subject,
            data=payload,
        )


# ── Generic (兜底) ──


class GenericNormalizer(BaseNormalizer):

    def detect(self, headers: dict[str, str]) -> bool:
        return True

    def normalize(self, headers: dict[str, str], payload: dict) -> CloudEvent:
        return _make_event(
            source="webhook/generic",
            event_type="webhook.received",
            data=payload,
        )


# ── Normalizer 注册表 ──

_NORMALIZERS: list[BaseNormalizer] = [
    GitHubNormalizer(),
    GitLabNormalizer(),
    GiteaNormalizer(),
    GenericNormalizer(),
]


_EVENT_TYPE_DESCRIPTIONS: dict[str, str] = {
    "git.push": "代码推送",
    "git.issue.opened": "Issue 创建",
    "git.issue.closed": "Issue 关闭",
    "git.issue.reopened": "Issue 重新打开",
    "git.issue.edited": "Issue 编辑",
    "git.issue.comment_created": "Issue 评论",
    "git.pull_request.created": "PR/MR 创建",
    "git.pull_request.closed": "PR/MR 关闭",
    "git.pull_request.synchronize": "PR/MR 更新",
    "git.pull_request.reopened": "PR/MR 重新打开",
    "git.pull_request.edited": "PR/MR 编辑",
    "git.pull_request.review_submitted": "PR/MR 评审提交",
    "git.pull_request.review_comment_created": "PR/MR 评审评论",
    "git.comment.created": "评论创建",
    "cron.tick": "定时触发",
    "manual.trigger": "手动触发",
    "webhook.received": "通用 Webhook",
}


def get_event_catalog() -> dict:
    """返回系统支持的所有事件源和事件类型。"""
    all_types: set[str] = set()
    for v in _GITHUB_EVENT_MAP.values():
        all_types.add(v)
    for v in _GITLAB_EVENT_MAP.values():
        all_types.add(v)
    for v in _GITEA_EVENT_MAP.values():
        all_types.add(v)
    all_types.update(["cron.tick", "manual.trigger", "webhook.received"])

    sources = [
        {"id": "github", "name": "GitHub", "description": "GitHub Webhook"},
        {"id": "gitlab", "name": "GitLab", "description": "GitLab Webhook"},
        {"id": "gitea", "name": "Gitea", "description": "Gitea Webhook"},
        {"id": "manual", "name": "手动触发", "description": "手动模拟事件"},
        {"id": "cron", "name": "定时任务", "description": "CRON 定时事件"},
        {"id": "generic", "name": "通用 Webhook", "description": "其他 HTTP Webhook"},
    ]

    event_types = []
    for t in sorted(all_types):
        category = t.split(".")[0]
        event_types.append({
            "type": t,
            "category": category,
            "description": _EVENT_TYPE_DESCRIPTIONS.get(t, t),
        })

    return {"sources": sources, "event_types": event_types}


def detect_and_normalize(
    headers: dict[str, str],
    payload: dict,
    body: bytes,
    secrets: dict[str, str],
) -> CloudEvent:
    """自动检测平台并标准化事件。

    Args:
        headers: HTTP 请求 headers（key 已小写）
        payload: 解析后的 JSON body
        body: 原始 request body（用于签名验证）
        secrets: 按平台名存储的 webhook secret，如 {"github": "xxx"}

    Returns:
        CloudEvent 字典

    Raises:
        ValueError: 签名验证失败
    """
    headers_lower = {k.lower(): v for k, v in headers.items()}

    for normalizer in _NORMALIZERS:
        if not normalizer.detect(headers_lower):
            continue

        platform = normalizer.__class__.__name__.replace("Normalizer", "").lower()
        secret = secrets.get(platform, "")

        if not normalizer.verify_signature(headers_lower, body, secret):
            raise ValueError(f"Webhook signature verification failed for {platform}")

        return normalizer.normalize(headers_lower, payload)

    return GenericNormalizer().normalize(headers_lower, payload)
