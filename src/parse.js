'use strict';
var _ = require('lodash');

function parse(expr) {
    var lexer = new Lexer();
    var parser = new Parser(lexer);
    return parser.parse(expr);
}

function Lexer() {
}
/* detect number, floats and scientific numbers*/
Lexer.prototype.isExpOperator = function(ch) { // decide if the character after exp is valid
    return ch === '-' || ch === '+' || this.isNumber(ch);
};

Lexer.prototype.peek = function() { // get next charachter without increment the index
    return this.index < this.text.length - 1 ?
        this.text.charAt(this.index + 1) :
        false;
};

Lexer.prototype.isNumber = function(ch) {  // detect number
    return '0' <= ch && ch <= '9';
};

Lexer.prototype.readNumber = function() {
    var number = '';
    while (this.index < this.text.length) {
        var ch = this.text.charAt(this.index).toLowerCase();
        if (ch === '.'|| this.isNumber(ch)) {// detect number or float
            number += ch;
        } else {//scientific number
            var nextCh = this.peek();
            var prevCh = number.charAt(number.length - 1);
            if (ch === 'e' && this.isExpOperator(nextCh)) {
                number += ch;
            } else if (this.isExpOperator(ch) && prevCh === 'e' &&
                       nextCh && this.isNumber(nextCh)) {
                number += ch;
            } else if (this.isExpOperator(ch) && prevCh === 'e' &&
                       (!nextCh || !this.isNumber(nextCh))) {
                throw 'Invalid exponent';
            } else {
                break;
            }
        }
        this.index++;
    }
    this.tokens.push({
        text: number,
        value: Number(number) //javacript cast
    });
};
/* detect strings and escape characters */
var ESCAPES = {'n':'\n', 'f':'\f', 'r':'\r', 't':'\t', 'v':'\v', '\'':'\'', '"':'"'};

Lexer.prototype.readString = function(quote) {
    this.index++;
    var escape = false;
    var string = '';
    while (this.index < this.text.length) {
        var ch = this.text.charAt(this.index);
        if (escape) {
            if (ch === 'u') { //unicode escape
                var hex = this.text.substring(this.index + 1, this.index + 5);
                if (!hex.match(/[\da-f]{4}/i)) { //valid unicode?
                    throw 'Invalid unicode escape';
                }
                this.index += 4;
                string += String.fromCharCode(parseInt(hex, 16));
            } else {
                var replacement = ESCAPES[ch];
                if (replacement) {//replace character with the escape
                    string += replacement;
                } else {//ignore the escpae and just add the char
                    string += ch;
                }
            }
            escape = false;
        } else if (ch === quote) {// detect end of string, build tokenb and return
            this.index++;
            this.tokens.push({
                text: string,
                value: string
            });
            return;
        } else if (ch === '\\') {//detect escape character
            escape = true;
        } else {// add a char
            string += ch;
        }
        this.index++;
    }
};
/* detect special words */
Lexer.prototype.isIdent = function(ch) {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
        ch === '_' || ch === '$';
};

Lexer.prototype.readIdent = function() {
    var text = '';
    while (this.index < this.text.length) { // keep adding the char untill the end or invalid one
        var ch = this.text.charAt(this.index);
        if (this.isIdent(ch) || this.isNumber(ch)) {
            text += ch;
        } else {
            break;
        }
        this.index++;
    }
    var token = {
        text: text,
        identifier: true
    };
    this.tokens.push(token);
};  
/* detect whitespace */
Lexer.prototype.isWhitespace = function(ch) {
    return ch === ' ' || ch === '\r' || ch === '\t' ||
        ch === '\n' || ch === '\v' || ch === '\u00A0';
};
/* check charachter among possibilities */
Lexer.prototype.is = function(chs) {
    return chs.indexOf(this.ch) >= 0;
};

Lexer.prototype.lex = function(text) {
    this.text = text;
    this.index = 0;
    this.ch = undefined;
    this.tokens = [];
    while (this.index < this.text.length) {
        this.ch = this.text.charAt(this.index);
        //parse number 
        if (this.isNumber(this.ch) || (this.ch === '.' && this.isNumber(this.peek()))) {
            this.readNumber();
        } else if (this.ch === '\'' || this.ch === '"') {//parse string
            this.readString(this.ch);
            //detect array or obejct parts
        } else if (this.is('[],{}:')) {
            this.tokens.push({
                text: this.ch
            });
            this.index++;
        } else if (this.isIdent(this.ch)) {// parse keyword
            this.readIdent();
        } else if (this.isWhitespace(this.ch)) {//ignore whitespace
            this.index++;
        }else { //invalid => throw
            throw 'Unexpected next character: ' + this.ch;
        }
    }
    return this.tokens;
};

function AST(lexer) {
    this.lexer = lexer;
}

/* suåpported ast objects */
AST.Program = 'Program';
AST.Literal = 'Literal';
AST.ArrayExpression = 'ArrayExpression';
AST.ObjectExpression = 'ObjectExpression';
AST.Property = 'Property';
AST.Identifier = 'Identifier';

/* verify token without consuming */
AST.prototype.peek = function(e) {
    if (this.tokens.length > 0) {
        var text = this.tokens[0].text;
        if (text === e || !e) {
            return this.tokens[0];
        }
    }
};
/* consume token if matched */
AST.prototype.expect = function(e) {
    var token = this.peek(e);
    if(token){
        return this.tokens.shift();
    }
};
/* consume token or throw if unmatched */
AST.prototype.consume = function(e) {
    var token = this.expect(e);
    if (!token) {
        throw 'Unexpected. Expecting: ' + e;
    }
    return token;
};
/* detect identifiers */
AST.prototype.identifier = function() {
    return {type: AST.Identifier, name: this.consume().text};
};
/* array detection */
AST.prototype.arrayDeclaration = function() {
    var elements = [];
    if (!this.peek(']')) {
        do {
            if (this.peek(']')) {
                break;
            } 
            elements.push(this.primary());
        } while (this.expect(','));
    } 
    this.consume(']');
    return {type: AST.ArrayExpression,  elements: elements}; 
};

/* object declaration */
AST.prototype.object = function() {
    var properties = [];
    if (!this.peek('}')) {
        do {
            var property = {type: AST.Property};
            if (this.peek().identifier) {
                property.key = this.identifier();
            } else {
                property.key = this.constant();
            } 
            this.consume(':');
            property.value = this.primary();
            properties.push(property);
        } while (this.expect(','));
    }
    this.consume('}');
    return {type: AST.ObjectExpression, properties: properties};
};

/* detect null true false*/
AST.prototype.constants = {
    'null': {type: AST.Literal, value: null},
    'true': {type: AST.Literal, value: true},
    'false': {type: AST.Literal, value: false}
};

/* detect number or string */
AST.prototype.constant = function() {
    return {type: AST.Literal, value: this.consume().value};
};

/* construct the body of ast object*/
AST.prototype.primary = function() {
    if (this.expect('[')) {
        return this.arrayDeclaration();
    } else if (this.expect('{')) {
        return this.object();
    } else if (this.constants.hasOwnProperty(this.tokens[0].text)) {
        return this.constants[this.consume().text];
    } else {
        return this.constant();
    }
};

/* root template of the ast object */
AST.prototype.program = function() {
    return {type: AST.Program, body: this.primary()};
};

/* use the lexer object to tokenize the text then build the ast object */
AST.prototype.ast = function(text) {
    this.tokens = this.lexer.lex(text);
    return this.program();
};


function ASTCompiler(astBuilder) {
    this.astBuilder = astBuilder;
}
/* replace characters with their unicode */
ASTCompiler.prototype.stringEscapeRegex = /[^ a-zA-Z0-9]/g;
ASTCompiler.prototype.stringEscapeFn = function(c) {
    return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
};

/* used to add quotes to string and detect null value*/
ASTCompiler.prototype.escape = function(value) {
    if (_.isString(value)) {
        return '\'' +  value.replace(this.stringEscapeRegex, this.stringEscapeFn) + '\'';
    } else if (_.isNull(value)) {
        return 'null';
    } else {
        return value;
    }
};
/* will build body of the function */
ASTCompiler.prototype.recurse = function(ast) {
    switch (ast.type) {
    case AST.Program:
        this.state.body.push('return ', this.recurse(ast.body), ';');
        break;
    case AST.Literal:
        return this.escape(ast.value);
    case AST.ArrayExpression:
        var elements = _.map(ast.elements, _.bind(function(element) {
            return this.recurse(element);
        }, this));
        return '[' + elements.join(',') + ']';
    case AST.ObjectExpression:
        var properties = _.map(ast.properties, _.bind(function(property) {
            var key = property.key.type === AST.Identifier ? property.key.name :
                this.escape(property.key.value);
            var value = this.recurse(property.value);
            return key + ':' + value;
        }, this));
        return '{' + properties.join(',') + '}';
    }
};

/* compile the ast object to function */
ASTCompiler.prototype.compile = function(text) {
    var ast = this.astBuilder.ast(text);
    this.state = {body: []};
    this.recurse(ast);
     /* jshint -W054 */
    return new Function(this.state.body.join(''));
    /* jshint +W054 */
};

function Parser(lexer) {
    this.lexer = lexer;
    this.ast = new AST(this.lexer);
    this.astCompiler = new ASTCompiler(this.ast);
}
Parser.prototype.parse = function(text) {
    return this.astCompiler.compile(text);
};

module.exports = parse;
