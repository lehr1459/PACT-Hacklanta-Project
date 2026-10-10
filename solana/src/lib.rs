#![no_std]
//! Hackathon Devnet demo. Fixed offers and buyer-bound, nontransferable expiry.
//! Dynamic runtime program ID; no embedded wallet or deployment key material.
use pinocchio::{account_info::AccountInfo, instruction::Signer, program_error::ProgramError,
    pubkey::{Pubkey, try_find_program_address}, sysvars::{clock::Clock, rent::Rent, Sysvar}, ProgramResult};
use pinocchio_system::instructions::{Allocate, Assign, Transfer};

pinocchio::program_entrypoint!(process_instruction);
#[panic_handler]
fn panic(_info: &core::panic::PanicInfo<'_>) -> ! { unsafe { pinocchio::syscalls::abort() } }
pinocchio::no_allocator!();

pub const CREATE: [u8;8] = [237,233,192,168,248,7,249,241];
pub const BUY: [u8;8] = [255,81,129,152,169,201,232,105];
pub const DEACTIVATE: [u8;8] = [233,95,11,47,132,49,106,67];
pub const OFFER: [u8;8] = [215,88,60,71,170,162,73,229];
pub const LICENSE: [u8;8] = [248,152,195,100,185,108,176,231];
pub const OFFER_SIZE: usize = 98;
pub const LICENSE_SIZE: usize = 81;
pub const MAX_DURATION: u64 = 31_536_000;

#[repr(u32)]
pub enum Error { InvalidTerms=6000, InvalidPda=6001, WrongOwner=6002, WrongSeller=6003,
    Inactive=6004, AlreadyLicensed=6005, AlreadyInitialized=6006, InvalidAccount=6007,
    Arithmetic=6008, AlreadyInactive=6009 }
fn err(e: Error) -> ProgramError { ProgramError::Custom(e as u32) }
fn u64_at(data:&[u8], offset:usize)->u64 { u64::from_le_bytes(data[offset..offset+8].try_into().unwrap()) }
fn i64_at(data:&[u8], offset:usize)->i64 { i64::from_le_bytes(data[offset..offset+8].try_into().unwrap()) }
fn signer(a:&AccountInfo)->ProgramResult { if !a.is_signer(){return Err(ProgramError::MissingRequiredSignature)} Ok(()) }
fn writable(a:&AccountInfo)->ProgramResult { if !a.is_writable(){return Err(err(Error::InvalidAccount))} Ok(()) }
fn system(a:&AccountInfo)->ProgramResult {
    if a.key()!=&pinocchio_system::ID || !a.executable(){return Err(err(Error::InvalidAccount))} Ok(())
}
fn wallet(a:&AccountInfo)->ProgramResult {
    if !a.is_owned_by(&pinocchio_system::ID) || !a.data_is_empty() || a.executable(){return Err(err(Error::WrongOwner))} Ok(())
}
fn validate_offer(program:&Pubkey, offer:&AccountInfo)->ProgramResult {
    if !offer.is_owned_by(program){return Err(err(Error::WrongOwner))}
    let data=offer.try_borrow_data()?;
    if data.len()!=OFFER_SIZE || data[..8]!=OFFER || data[96]>1{return Err(err(Error::InvalidAccount))}
    let (expected,bump)=try_find_program_address(&[b"offer",&data[8..40],&data[40..48]],program).ok_or(err(Error::InvalidPda))?;
    if offer.key()!=&expected || data[97]!=bump{return Err(err(Error::InvalidPda))} Ok(())
}
/// Allocate/assign an initially system-owned empty PDA, including a pre-funded PDA.
/// This avoids a third-party lamport donation permanently preventing initialization.
fn initialize(program:&Pubkey,payer:&AccountInfo,target:&AccountInfo,size:usize,seeds:&[pinocchio::instruction::Seed])->ProgramResult {
    if !target.is_owned_by(&pinocchio_system::ID) || !target.data_is_empty() || target.executable(){return Err(err(Error::AlreadyInitialized))}
    writable(target)?;
    let minimum=Rent::get()?.minimum_balance(size);
    let topup=minimum.saturating_sub(target.lamports());
    if topup>0 { Transfer{from:payer,to:target,lamports:topup}.invoke()?; }
    let signers=[Signer::from(seeds)];
    Allocate{account:target,space:size as u64}.invoke_signed(&signers)?;
    Assign{account:target,owner:program}.invoke_signed(&signers)?;
    Ok(())
}

pub fn process_instruction(program:&Pubkey, accounts:&[AccountInfo], input:&[u8])->ProgramResult {
    if input.len()<8{return Err(ProgramError::InvalidInstructionData)}
    if input[..8]==CREATE { create(program,accounts,input) }
    else if input[..8]==BUY && input.len()==8 { buy(program,accounts) }
    else if input[..8]==DEACTIVATE && input.len()==8 { deactivate(program,accounts) }
    else { Err(ProgramError::InvalidInstructionData) }
}
fn create(program:&Pubkey,accounts:&[AccountInfo],input:&[u8])->ProgramResult {
    if input.len()!=64 || accounts.len()!=3{return Err(ProgramError::InvalidInstructionData)}
    let seller=&accounts[0]; let offer=&accounts[1];
    signer(seller)?; writable(seller)?; wallet(seller)?; system(&accounts[2])?;
    let price=u64_at(input,16); let duration=u64_at(input,24);
    if price==0 || duration==0 || duration>MAX_DURATION || input[32..64].iter().all(|v|*v==0){return Err(err(Error::InvalidTerms))}
    let nonce=&input[8..16];
    let (expected,bump)=try_find_program_address(&[b"offer",seller.key(),nonce],program).ok_or(err(Error::InvalidPda))?;
    if offer.key()!=&expected{return Err(err(Error::InvalidPda))}
    let bump_seed=[bump]; let seeds=pinocchio::seeds!(b"offer",seller.key(),nonce,&bump_seed);
    initialize(program,seller,offer,OFFER_SIZE,&seeds)?;
    let mut data=offer.try_borrow_mut_data()?;
    data[..8].copy_from_slice(&OFFER); data[8..40].copy_from_slice(seller.key());
    data[40..48].copy_from_slice(nonce); data[48..56].copy_from_slice(&price.to_le_bytes());
    data[56..64].copy_from_slice(&duration.to_le_bytes()); data[64..96].copy_from_slice(&input[32..64]);
    data[96]=1; data[97]=bump;
    Ok(())
}
fn buy(program:&Pubkey,accounts:&[AccountInfo])->ProgramResult {
    if accounts.len()!=5{return Err(ProgramError::InvalidInstructionData)}
    let buyer=&accounts[0]; let offer=&accounts[1]; let seller=&accounts[2]; let license=&accounts[3];
    signer(buyer)?; writable(buyer)?; wallet(buyer)?; writable(seller)?; wallet(seller)?;
    writable(license)?; system(&accounts[4])?; validate_offer(program,offer)?;
    let (price,duration)={let data=offer.try_borrow_data()?;
        if data[8..40]!=seller.key()[..]{return Err(err(Error::WrongSeller))}
        if data[96]!=1{return Err(err(Error::Inactive))}
        (u64_at(&data,48),u64_at(&data,56))};
    let now=Clock::get()?.unix_timestamp;
    if now<0 || price==0 || duration==0 || duration>MAX_DURATION{return Err(err(Error::Arithmetic))}
    let expiry=now.checked_add(i64::try_from(duration).map_err(|_|err(Error::Arithmetic))?).ok_or(err(Error::Arithmetic))?;
    let (expected,bump)=try_find_program_address(&[b"license",offer.key(),buyer.key()],program).ok_or(err(Error::InvalidPda))?;
    if license.key()!=&expected{return Err(err(Error::InvalidPda))}
    if license.is_owned_by(program){
        let data=license.try_borrow_data()?;
        if data.len()!=LICENSE_SIZE || data[..8]!=LICENSE || data[8..40]!=offer.key()[..] || data[40..72]!=buyer.key()[..] || data[80]!=bump{return Err(err(Error::InvalidAccount))}
        if i64_at(&data,72)>now{return Err(err(Error::AlreadyLicensed))}
    } else {
        let bump_seed=[bump]; let seeds=pinocchio::seeds!(b"license",offer.key(),buyer.key(),&bump_seed);
        initialize(program,buyer,license,LICENSE_SIZE,&seeds)?;
    }
    // Fixed-price native SOL settlement through the System Program; no arbitrary value arg.
    // Solana transaction atomicity rolls initialization/transfer/data writes back on failure.
    Transfer{from:buyer,to:seller,lamports:price}.invoke()?;
    let mut data=license.try_borrow_mut_data()?;
    data[..8].copy_from_slice(&LICENSE); data[8..40].copy_from_slice(offer.key());
    data[40..72].copy_from_slice(buyer.key()); data[72..80].copy_from_slice(&expiry.to_le_bytes()); data[80]=bump;
    Ok(())
}
fn deactivate(program:&Pubkey,accounts:&[AccountInfo])->ProgramResult {
    if accounts.len()!=2{return Err(ProgramError::InvalidInstructionData)}
    signer(&accounts[0])?; writable(&accounts[1])?; validate_offer(program,&accounts[1])?;
    let mut data=accounts[1].try_borrow_mut_data()?;
    if data[8..40]!=accounts[0].key()[..]{return Err(err(Error::WrongSeller))}
    if data[96]==0{return Err(err(Error::AlreadyInactive))} data[96]=0; Ok(())
}
