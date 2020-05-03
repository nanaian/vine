import ALU, { Tryte, s2t, t2n, n2t, t2s, clone } from '../vm/ALU.js'
import Memory from '../vm/Memory.js'
import {
  Instruction,
  InstructionLabeled,
  AddressingMode,
  assembleInstruction,
} from '../vm/Instruction.js'

export interface DebugInfo {
  labels: Map<string, Tryte>,
  instructions: InstructionLabeled[],
}

type LabelMap = Map<string, number>

// Unwraps a type unioned with null, throwing the given error if it is null.
function expect<T>(maybe: T | null | undefined, error: Error | string): T {
  if (maybe == null || typeof maybe == 'undefined') {
    if (typeof error == 'string') {
      throw new Error(error)
    } else {
      throw error
    }
  } else {
    return maybe
  }
}

export default function assemble(input: string): {
  mem: Memory,
  debug: DebugInfo,
} {
  const lines = input
    .split('\n')
    .map(line => line.replace(/;.*$/, '').trim()) // Remove comments & indentation whitespace
    .filter(line => line.length > 0) // Ignore empty lines

  const cart = new Memory()
  const alu = new ALU()

  const labels = new Map()

  // First pass: determine label addresses
  {
    const address = s2t('ooooooooo')

    for (const line of lines) {
      if (line[0] != '.') {
        // Instruction.
        const [mnemonic, ...operands] = parseInstructionParts(line)
        const instruction = parseInstruction(mnemonic, operands)

        if (operands.length) {
          throw new Error(`${mnemonic}: too many operands`)
        }

        alu.add(address, n2t(1))
        if (instruction.z) alu.add(address, n2t(1))
      } else {
        // Label.
        const labelName = line.substr(1)

        if (labels.has(labelName)) {
          console.warn('label redeclared:', labelName)
        }

        labels.set(labelName, clone(address))
      }
    }
  }

  // Second pass: assemble instructions
  const instructions = []
  {
    const address = s2t('ooooooooo')

    for (const line of lines) {
      if (line[0] != '.') {
        // Instruction.
        const [mnemonic, ...operands] = parseInstructionParts(line)
        const instruction = parseInstruction(mnemonic, operands)

        instructions[t2n(address)] = instruction

        const data = assembleInstruction(instruction, labels)

        console.debug(`$${t2s(address)}: ${t2s(data[0])} ${line}`, instruction)
        cart.store(data[0], address)
        alu.add(address, n2t(1))

        if (data[1]) {
          console.debug(`$${t2s(address)}: ${t2s(data[1])}`)
          cart.store(data[1], address)
          alu.add(address, n2t(1))
        }
      }
    }
  }

  return { mem: cart, debug: { labels, instructions } }
}

function parseInstructionParts(line: string): string[] {
  const operands = []
  let buffer = ''

  for (const char of line) {
    if (operands.length == 0) {
      if (char == ' ') {
        operands.push(buffer)
        buffer = ''
      } else {
        buffer += char
      }
    } else {
      if (char == ',') {
        operands.push(buffer)
        buffer = ''
      } else {
        buffer += char
      }
    }
  }

  if (buffer.length > 0) operands.push(buffer)

  return operands
}

// Mutates `operands`.
function parseInstruction(mnemonic: string, operands: string[]): InstructionLabeled {
  switch (mnemonic.toUpperCase()) {
    case 'NOP': {
      // MOV r4, r4
      return {
        opcode: n2t(0),
        addressingMode: AddressingMode.REGISTER_REGISTER,
        x: n2t(0),
        y: n2t(0),
        z: null,
      }
    }
    case 'MOV': {
      return expect(
        unionParseYZ(
          {
            opcode: n2t(0),
            x: expect(
              parseRegisterOperand(operands.shift()),
              'MOV: operand 1 (destination) must be a register',
            ),
          },
          operands.shift(),
        ),
        'MOV: operand 2 (source) must be a register or immediate',
      )
    }
    case 'ADD': {
      return expect(
        unionParseYZ(
          {
            opcode: n2t(-39),
            x: expect(
              parseRegisterOperand(operands.shift()),
              'ADD: operand 1 must be a register',
            ),
          },
          operands.shift(),
        ),
        'ADD: operand 2 must be a register or immediate',
      )
    }
    // ADC
    case 'MUL': {
      return expect(
        unionParseYZ(
          {
            opcode: n2t(-37),
            x: expect(
              parseRegisterOperand(operands.shift()),
              'MUL: operand 1 must be a register',
            ),
          },
          operands.shift(),
        ),
        'MUL: operand 2 must be a register or immediate',
      )
    }
    case 'DIV': {
      return expect(
        unionParseYZ(
          {
            opcode: n2t(-36),
            x: expect(
              parseRegisterOperand(operands.shift()),
              'DIV: operand 1 must be a register',
            ),
          },
          operands.shift(),
        ),
        'DIV: operand 2 must be a register or immediate',
      )
    }
    // MOD
    case 'STA': {
      return expect(
        unionParseYZ(
          {
            opcode: n2t(2),
            x: expect(
              parseRegisterOperand(operands.shift()),
              'STA: operand 1 must be a register',
            ),
          },
          operands.shift(),
        ),
        'STA: operand 2 must be a register or address',
      )
    }
    case 'LDA': {
      return expect(
        unionParseYZ(
          {
            opcode: n2t(1),
            x: expect(
              parseRegisterOperand(operands.shift()),
              'LDA: operand 1 must be a register',
            ),
          },
          operands.shift(),
        ),
        'LDA: operand 2 must be a register or address',
      )
    }
    case 'JMP': {
      return expect(
        unionParseYZ(
          {
            opcode: n2t(36),
            x: n2t(0),
          },
          operands.shift(),
          { allowLabel: true },
        ),
        'JMP: operand must be a register or immediate address',
      )
    }
    default:
      throw new Error(`unknown operation '${mnemonic}'`)
  }
}

function isShort(value: Tryte): boolean {
  const n = t2n(value)
  return n > 4 && n < -4
}

function unionParseYZ(
  partial: { opcode: Tryte; x: Tryte },
  operand: string | null | undefined,
  options: { allowLabel: boolean } = { allowLabel: false },
): InstructionLabeled | null {
  const asRegister = parseRegisterOperand(operand)
  if (asRegister) {
    return {
      ...partial,
      addressingMode: AddressingMode.REGISTER_REGISTER,
      y: asRegister,
      z: null,
    }
  }

  const asImmediate = parseImmediateOperand(operand)
  if (asImmediate) {
    if (isShort(asImmediate)) {
      return {
        ...partial,
        addressingMode: AddressingMode.SHORT_IMMEDIATE,
        y: asImmediate,
        z: null,
      }
    } else {
      return {
        ...partial,
        addressingMode: AddressingMode.WORD_IMMEDIATE,
        y: n2t(0),
        z: asImmediate,
      }
    }
  }

  if (options.allowLabel) {
    const asAddress = parseAddressOperand(operand)
    if (asAddress) {
      return {
        ...partial,
        addressingMode: AddressingMode.WORD_IMMEDIATE,
        y: n2t(0),
        z: asAddress,
      }
    }
  }

  return null
}

function parseRegisterOperand(
  operand: string | null | undefined,
): Tryte | null {
  if (!operand) {
    return null
  }

  const trimmed = operand.trim().toLowerCase()

  switch (trimmed) {
    case 'r0':
      return n2t(-4)
    case 'r1':
      return n2t(-3)
    case 'r2':
      return n2t(-2)
    case 'r3':
      return n2t(-1)
    case 'r4':
      return n2t(0)
    case 'r5':
      return n2t(1)
    case 'r6':
      return n2t(2)
    case 'ra':
      return n2t(3)
    case 'sp':
      return n2t(4)
    default:
      return null
  }
}

function parseImmediateOperand(
  operand: string | null | undefined,
): Tryte | null {
  if (!operand) {
    return null
  }

  const trimmed = operand.trim()

  try {
    return s2t(trimmed)
  } catch {
    return null
  }
}

// 'ImmReg' stands for 'immediate or register.' We need this tagged union as both registers and
// immediates are typically stored as trytes, but we need to discriminate between them.
type ImmReg =
  | { type: 'immediate'; data: Tryte }
  | { type: 'register'; data: Tryte }
function parseImmRegOperand(operand: string | null | undefined): ImmReg | null {
  const immediate = parseImmediateOperand(operand)
  if (immediate) {
    return { type: 'immediate', data: immediate }
  }

  const register = parseRegisterOperand(operand)
  if (register) {
    return { type: 'register', data: register }
  }

  return null
}

function parseAddressOperand(
  operand: string | null | undefined,
): Tryte | string | null {
  if (!operand) {
    return null
  }

  const trimmed = operand.trim()

  if (trimmed[0] == '.') {
    // Label
    return trimmed.substr(1)
  } else {
    // Raw address
    try {
      return s2t(trimmed)
    } catch {
      return null
    }
  }
}

function assembleOperandStr(
  operand: string,
  labels: LabelMap,
): [Tryte, Tryte | null] {
  const parseRegister = (operand: string) => {
    const register = parseInt(operand.substr(1))

    if (isNaN(register) || register < 0 || register > 11) {
      throw new Error('Unknown register: ' + operand)
    }

    return register
  }

  if (operand[0] == 'r') {
    // Register
    return [n2t(parseRegister(operand) + 1), null]
  } else if (operand[0] == '.') {
    // Immediate, labeled
    const addr = labels.get(operand.substr(1))

    if (typeof addr == 'undefined') {
      throw new Error('Undeclared ROM label: ' + operand.substr(1))
    }

    return [n2t(-13), n2t(addr)]
  } else if (operand[0] == '*') {
    if (operand[1] == 'r') {
      // Register-indirect pointer
      return [n2t(parseRegister(operand.substr(1)) - 11), null]
    } else if (operand[2] == '.') {
      throw new Error('ROM label not allowed here: ' + operand)
    } else {
      // Immediate-direct pointer
      return [n2t(-12), s2t(operand.substr(1))]
    }
  } else {
    // Immediate
    return [n2t(-13), s2t(operand)]
  }
}

function assembleOpcodeStr(str: string): Tryte {
  switch (str.toUpperCase()) {
    case 'ADD':
      return n2t(-13)
    // 12
    case 'ADDC':
      return n2t(-11)
    case 'MUL':
      return n2t(-10)
    case 'DIV':
      return n2t(-9)
    case 'MOD':
      return n2t(-8)
    case 'NEG':
      return n2t(-7)
    case 'MIN':
      return n2t(-6)
    case 'MAX':
      return n2t(-5)
    case 'CON':
      return n2t(-4)
    case 'ANY':
      return n2t(-3)
    case 'RSH':
      return n2t(-2)
    case 'USH':
      return n2t(-1)
    case 'NOP':
      return n2t(0)
    case 'MOV':
      return n2t(1)
    case 'CMP':
      return n2t(2)
    case 'JMP':
      return n2t(3)
    case 'BEQ':
      return n2t(4)
    case 'BGT':
      return n2t(5)
    case 'BLT':
      return n2t(6)
    case 'JAL':
      return n2t(7)
    case 'LOD':
      return n2t(8)
    case 'XOR':
      return n2t(9)
    default:
      throw new Error('Unknown instruction: ' + str)
  }
}
