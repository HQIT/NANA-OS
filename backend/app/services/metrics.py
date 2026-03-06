"""轻量级性能指标收集器。"""

from collections import deque
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Metrics:
    """内存中的轻量级指标收集器"""
    
    # 计数器
    events_received_total: int = 0
    events_dispatched_total: int = 0
    events_failed_total: int = 0
    events_retried_total: int = 0
    events_deduplicated_total: int = 0
    
    # 最近 100 次投递的耗时（秒）
    dispatch_durations: deque = field(default_factory=lambda: deque(maxlen=100))
    
    # 按事件类型统计
    event_types_count: dict[str, int] = field(default_factory=dict)
    
    # 按 Agent 统计
    agent_dispatch_count: dict[str, int] = field(default_factory=dict)
    
    def record_event_received(self, event_type: str):
        """记录收到的事件"""
        self.events_received_total += 1
        self.event_types_count[event_type] = self.event_types_count.get(event_type, 0) + 1
    
    def record_dispatch(self, duration: float, success: bool, agent_ids: list[str]):
        """记录事件投递结果"""
        if success:
            self.events_dispatched_total += 1
        else:
            self.events_failed_total += 1
        
        self.dispatch_durations.append(duration)
        
        for agent_id in agent_ids:
            self.agent_dispatch_count[agent_id] = self.agent_dispatch_count.get(agent_id, 0) + 1
    
    def record_retry(self):
        """记录重试事件"""
        self.events_retried_total += 1
    
    def record_dedup(self):
        """记录去重事件"""
        self.events_deduplicated_total += 1
    
    def get_summary(self) -> dict[str, Any]:
        """获取指标摘要"""
        avg_duration = (
            sum(self.dispatch_durations) / len(self.dispatch_durations) 
            if self.dispatch_durations else 0
        )
        
        return {
            "counters": {
                "events_received": self.events_received_total,
                "events_dispatched": self.events_dispatched_total,
                "events_failed": self.events_failed_total,
                "events_retried": self.events_retried_total,
                "events_deduplicated": self.events_deduplicated_total,
            },
            "performance": {
                "avg_dispatch_duration_seconds": round(avg_duration, 3),
                "p95_dispatch_duration_seconds": (
                    round(sorted(self.dispatch_durations)[int(len(self.dispatch_durations) * 0.95)], 3)
                    if len(self.dispatch_durations) > 0 else 0
                ),
                "sample_size": len(self.dispatch_durations),
            },
            "top_event_types": sorted(
                self.event_types_count.items(),
                key=lambda x: x[1],
                reverse=True
            )[:10],
            "top_agents": sorted(
                self.agent_dispatch_count.items(),
                key=lambda x: x[1],
                reverse=True
            )[:10],
        }


# 全局单例
metrics = Metrics()
