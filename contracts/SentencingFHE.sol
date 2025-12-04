// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract SentencingFHE is SepoliaConfig {
    struct EncryptedCase {
        uint256 id;
        euint32 encryptedCharge;
        euint32 encryptedSentence;
        euint32 encryptedJudgeId;
        uint256 timestamp;
    }
    
    struct DecryptedCase {
        string charge;
        uint256 sentence;
        string judgeId;
        bool isAnalyzed;
    }

    uint256 public caseCount;
    mapping(uint256 => EncryptedCase) public encryptedCases;
    mapping(uint256 => DecryptedCase) public decryptedCases;
    
    mapping(string => euint32) private encryptedJudgeStats;
    string[] private judgeList;
    
    mapping(uint256 => uint256) private requestToCaseId;
    
    event CaseSubmitted(uint256 indexed id, uint256 timestamp);
    event AnalysisRequested(uint256 indexed id);
    event CaseAnalyzed(uint256 indexed id);
    
    modifier onlyCourt(uint256 caseId) {
        _;
    }
    
    function submitEncryptedCase(
        euint32 encryptedCharge,
        euint32 encryptedSentence,
        euint32 encryptedJudgeId
    ) public {
        caseCount += 1;
        uint256 newId = caseCount;
        
        encryptedCases[newId] = EncryptedCase({
            id: newId,
            encryptedCharge: encryptedCharge,
            encryptedSentence: encryptedSentence,
            encryptedJudgeId: encryptedJudgeId,
            timestamp: block.timestamp
        });
        
        decryptedCases[newId] = DecryptedCase({
            charge: "",
            sentence: 0,
            judgeId: "",
            isAnalyzed: false
        });
        
        emit CaseSubmitted(newId, block.timestamp);
    }
    
    function requestSentencingAnalysis(uint256 caseId) public onlyCourt(caseId) {
        EncryptedCase storage c = encryptedCases[caseId];
        require(!decryptedCases[caseId].isAnalyzed, "Already analyzed");
        
        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(c.encryptedCharge);
        ciphertexts[1] = FHE.toBytes32(c.encryptedSentence);
        ciphertexts[2] = FHE.toBytes32(c.encryptedJudgeId);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.analyzeCase.selector);
        requestToCaseId[reqId] = caseId;
        
        emit AnalysisRequested(caseId);
    }
    
    function analyzeCase(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 caseId = requestToCaseId[requestId];
        require(caseId != 0, "Invalid request");
        
        EncryptedCase storage eCase = encryptedCases[caseId];
        DecryptedCase storage dCase = decryptedCases[caseId];
        require(!dCase.isAnalyzed, "Already analyzed");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        (string memory charge, uint256 sentence, string memory judgeId) = 
            abi.decode(cleartexts, (string, uint256, string));
        
        dCase.charge = charge;
        dCase.sentence = sentence;
        dCase.judgeId = judgeId;
        dCase.isAnalyzed = true;
        
        if (FHE.isInitialized(encryptedJudgeStats[dCase.judgeId]) == false) {
            encryptedJudgeStats[dCase.judgeId] = FHE.asEuint32(0);
            judgeList.push(dCase.judgeId);
        }
        encryptedJudgeStats[dCase.judgeId] = FHE.add(
            encryptedJudgeStats[dCase.judgeId], 
            FHE.asEuint32(1)
        );
        
        emit CaseAnalyzed(caseId);
    }
    
    function getDecryptedCase(uint256 caseId) public view returns (
        string memory charge,
        uint256 sentence,
        string memory judgeId,
        bool isAnalyzed
    ) {
        DecryptedCase storage c = decryptedCases[caseId];
        return (c.charge, c.sentence, c.judgeId, c.isAnalyzed);
    }
    
    function getEncryptedJudgeStats(string memory judgeId) public view returns (euint32) {
        return encryptedJudgeStats[judgeId];
    }
    
    function requestJudgeStatsDecryption(string memory judgeId) public {
        euint32 stats = encryptedJudgeStats[judgeId];
        require(FHE.isInitialized(stats), "Judge not found");
        
        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(stats);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptJudgeStats.selector);
        requestToCaseId[reqId] = bytes32ToUint(keccak256(abi.encodePacked(judgeId)));
    }
    
    function decryptJudgeStats(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 judgeHash = requestToCaseId[requestId];
        string memory judgeId = getJudgeFromHash(judgeHash);
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        uint32 stats = abi.decode(cleartexts, (uint32));
    }
    
    function bytes32ToUint(bytes32 b) private pure returns (uint256) {
        return uint256(b);
    }
    
    function getJudgeFromHash(uint256 hash) private view returns (string memory) {
        for (uint i = 0; i < judgeList.length; i++) {
            if (bytes32ToUint(keccak256(abi.encodePacked(judgeList[i]))) == hash) {
                return judgeList[i];
            }
        }
        revert("Judge not found");
    }
    
    function calculateSentencingStats(
        string memory chargeType
    ) public view returns (uint256 avgSentence, uint256 minSentence, uint256 maxSentence) {
        uint256 total = 0;
        uint256 count = 0;
        minSentence = type(uint256).max;
        maxSentence = 0;
        
        for (uint256 i = 1; i <= caseCount; i++) {
            if (decryptedCases[i].isAnalyzed && 
                keccak256(abi.encodePacked(decryptedCases[i].charge)) == keccak256(abi.encodePacked(chargeType))) {
                total += decryptedCases[i].sentence;
                count++;
                if (decryptedCases[i].sentence < minSentence) {
                    minSentence = decryptedCases[i].sentence;
                }
                if (decryptedCases[i].sentence > maxSentence) {
                    maxSentence = decryptedCases[i].sentence;
                }
            }
        }
        avgSentence = count > 0 ? total / count : 0;
        return (avgSentence, minSentence, maxSentence);
    }
    
    function detectSentencingDisparities(
        string memory chargeType,
        string[] memory judgeIds
    ) public view returns (string[] memory judges, uint256[] memory avgSentences) {
        judges = new string[](judgeIds.length);
        avgSentences = new uint256[](judgeIds.length);
        
        for (uint256 i = 0; i < judgeIds.length; i++) {
            uint256 total = 0;
            uint256 count = 0;
            
            for (uint256 j = 1; j <= caseCount; j++) {
                if (decryptedCases[j].isAnalyzed && 
                    keccak256(abi.encodePacked(decryptedCases[j].charge)) == keccak256(abi.encodePacked(chargeType)) &&
                    keccak256(abi.encodePacked(decryptedCases[j].judgeId)) == keccak256(abi.encodePacked(judgeIds[i]))) {
                    total += decryptedCases[j].sentence;
                    count++;
                }
            }
            
            judges[i] = judgeIds[i];
            avgSentences[i] = count > 0 ? total / count : 0;
        }
        return (judges, avgSentences);
    }
}