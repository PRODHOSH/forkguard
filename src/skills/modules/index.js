// SPDX-License-Identifier: Apache-2.0
// Derived from NVIDIA SkillSpector (https://github.com/NVIDIA/SkillSpector),
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// Translated to JavaScript and changed by Prodhosh V.S for forkguard. See NOTICE.
// Every rule module, in the order SkillSpector's analyzers are registered.
import { BATCH1 } from './batch1.js';
import { promptInjection } from './prompt.js';
import { yara } from './yara.js';
import { privilegeEscalation, dataExfiltration } from './privesc.js';
import { rogueAgent } from './rogue.js';
import { memoryPoisoning, outputHandling } from './memory.js';
import { supplyChain, triggerAbuse, systemPromptLeakage, toolMisuse } from './supply.js';

export const MODULES = [...BATCH1, promptInjection, yara, privilegeEscalation, dataExfiltration, rogueAgent, memoryPoisoning, outputHandling, supplyChain, triggerAbuse, systemPromptLeakage, toolMisuse];
