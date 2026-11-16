#!/usr/bin/env python3
"""Generate a portable legacy Notes action workflow; sign on macOS before distribution.
Action format is a compatibility artifact; device folder selection remains necessary.
"""
from pathlib import Path
import plistlib, uuid
root=Path(__file__).resolve().parent.parent
clip=str(uuid.uuid4()).upper()
token={'Value':{'Type':'ActionOutput','OutputUUID':clip,'OutputName':'Clipboard'},'WFSerializationType':'WFTextTokenAttachment'}
workflow={
 'WFWorkflowName':'拾念 · 存到备忘录',
 'WFWorkflowClientVersion':'2600',
 'WFWorkflowMinimumClientVersion':900,
 'WFWorkflowMinimumClientVersionString':'900',
 'WFWorkflowIcon':{'WFWorkflowIconStartColor':4282601983,'WFWorkflowIconGlyphNumber':59511},
 'WFWorkflowTypes':[],
 'WFWorkflowInputContentItemClasses':['WFStringContentItem'],
 'WFWorkflowImportQuestions':[],
 'WFWorkflowActions':[
  {'WFWorkflowActionIdentifier':'is.workflow.actions.comment','WFWorkflowActionParameters':{'WFCommentActionText':'首次使用请编辑最后的创建备忘录操作，把文件夹选为「灵感收集」。本快捷指令读取剪贴板中的整理结果；运行前请确认剪贴板是你要保存的内容。不同系统版本如提示动作不可用，可按拾念指南手动添加「获取剪贴板」和「创建备忘录」。'}},
  {'WFWorkflowActionIdentifier':'is.workflow.actions.getclipboard','WFWorkflowActionParameters':{'UUID':clip}},
  {'WFWorkflowActionIdentifier':'is.workflow.actions.createnote','WFWorkflowActionParameters':{'WFInput':token,'WFCreateNoteInput':token,'WFNoteBody':token,'WFShowComposeSheet':True,'UUID':str(uuid.uuid4()).upper()}}
 ]}
path=root/'scripts'/'save-to-notes.unsigned.shortcut'
path.write_bytes(plistlib.dumps(workflow,fmt=plistlib.FMT_BINARY))
assert plistlib.loads(path.read_bytes())['WFWorkflowActions'][1]['WFWorkflowActionIdentifier']=='is.workflow.actions.getclipboard'
print(path)
